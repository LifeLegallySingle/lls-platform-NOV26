import type { Contact, Env } from "../env";
import { addHours, nowIso } from "../env";
import { SEQ_BY_ID } from "./sequences";
import { sendTemplate } from "./send";
import { suppress } from "./suppress";
import { flushBrevo, flushFeedback } from "./feedback";
import { ensureBrevoLists } from "./brevo-sync";
import { BREVO_SYNC, DELIVERABILITY } from "../config";

type DueRow = Contact & { enrollment_id: number; sequence: string; step: number; enrolled_at: string };

export async function sentToday(env: Env) {
  const dayStart = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM sends WHERE sent_at >= ? AND status IN ('sent','dry_run')")
    .bind(dayStart).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function runScheduler(env: Env) {
  const report = { processed: 0, sent: 0, skipped: 0, deferred: 0, completed: 0, sunset: 0, failed: 0, capped: false, feedback: { sent: 0, failed: 0 } };
  report.feedback = await flushFeedback(env, 3);
  const lists = await env.DB.prepare("SELECT COUNT(*) n FROM brevo_lists").first<{ n: number }>();
  // Free plan = 50 D1 queries / invocation: list provisioning (one-time) gets its own run.
  if ((lists?.n ?? 0) < BREVO_SYNC.knownSources.length) { (report as any).brevo_lists = await ensureBrevoLists(env); return report; }
  (report as any).brevo = await flushBrevo(env, 2);

  // Hourly housekeeping: event retention + old counters (2 queries).
  if (new Date().getUTCMinutes() < 5) {
    const cutoff = new Date(Date.now() - DELIVERABILITY.eventRetentionDays * 864e5).toISOString();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM email_events WHERE created_at < ?").bind(cutoff),
      env.DB.prepare("DELETE FROM daily_counters WHERE day < ?").bind(cutoff.slice(0, 10)),
    ]);
  }

  const cap = Number(env.DAILY_SEND_CAP || 250);
  let remaining = cap - (await sentToday(env));
  if (remaining <= 0) { report.capped = true; return report; }

  const now = nowIso();
  const minGap = Number(env.MIN_HOURS_BETWEEN_EMAILS || 20);
  // Free plan: 50 D1 queries / invocation. Worst case ≈ 6 + 5 per row → keep BATCH_SIZE ≤ 8.
  const batch = Math.min(Number(env.BATCH_SIZE || 6), 8, remaining);
  const { results } = await env.DB.prepare(
    `SELECT c.*, e.id AS enrollment_id, e.sequence, e.step, e.created_at AS enrolled_at
       FROM enrollments e JOIN contacts c ON c.id = e.contact_id
      WHERE e.status = 'active' AND e.next_at <= ?
      ORDER BY e.next_at LIMIT ?`
  ).bind(now, batch).all<DueRow>();

  const sentThisRun = new Set<number>();
  for (const row of results) {
    report.processed++;
    const seq = SEQ_BY_ID[row.sequence];
    const setEnroll = (fields: string, ...vals: unknown[]) =>
      env.DB.prepare(`UPDATE enrollments SET ${fields}, updated_at = ? WHERE id = ?`).bind(...vals, nowIso(), row.enrollment_id).run();

    if (!seq || row.status !== "active") { await setEnroll("status='exited', exit_reason=?", seq ? `contact_${row.status}` : "unknown_sequence"); report.skipped++; continue; }

    const step = seq.steps[row.step];
    if (!step) { await setEnroll("status='completed'"); report.completed++; continue; }

    const advance = async () => {
      const next = seq.steps[row.step + 1];
      if (!next) await setEnroll("status='completed', step=?", row.step + 1);
      else await setEnroll("step=?, next_at=?", row.step + 1, addHours(nowIso(), next.delayHours));
    };

    if (step.action === "sunset") {
      await suppress(env, row.email, "sunset", `sequence:${seq.id}`);
      report.sunset++;
      continue;
    }
    if (step.when && !step.when(row)) { await advance(); report.skipped++; continue; }

    // Global frequency cap across all journeys.
    const lastSent = sentThisRun.has(row.id) ? now : row.last_sent_at;
    if (lastSent && addHours(lastSent, minGap) > now) {
      await setEnroll("next_at=?", addHours(lastSent, minGap));
      report.deferred++;
      continue;
    }

    const r = await sendTemplate(env, row, step.template!, { sequence: seq.id, step: row.step, enrollmentId: row.enrollment_id });
    if (r.ok) { await advance(); report.sent++; remaining--; sentThisRun.add(row.id); }
    else { await setEnroll("next_at=?", addHours(nowIso(), 6)); report.failed++; }
    if (remaining <= 0) { report.capped = true; break; }
  }
  return report;
}
