import type { Contact, Env } from "../env";
import { addHours, nowIso } from "../env";
import { SEQ_BY_ID } from "./sequences";
import { sendTemplate } from "./send";

/**
 * Send step 0 of a just-enrolled journey immediately (confirmation emails).
 * Claims the enrollment first so the cron can't double-send; on failure hands it back to the cron.
 */
export async function sendInstant(env: Env, contactId: number, sequence: string) {
  const seq = SEQ_BY_ID[sequence];
  const step = seq?.steps[0];
  if (!seq || !step?.instant || !step.template) return;
  const claim = await env.DB.prepare(
    "UPDATE enrollments SET next_at = '9999-12-31T00:00:00.000Z', updated_at = ? WHERE contact_id = ? AND sequence = ? AND step = 0 AND status = 'active' RETURNING id"
  ).bind(nowIso(), contactId, sequence).first<{ id: number }>();
  if (!claim) return;
  const c = await env.DB.prepare("SELECT * FROM contacts WHERE id = ?").bind(contactId).first<Contact>();
  if (!c || c.status !== "active") return;
  const r = await sendTemplate(env, c, step.template, { sequence, step: 0, enrollmentId: claim.id });
  const next = seq.steps[1];
  if (r.ok) {
    await env.DB.prepare(next
      ? "UPDATE enrollments SET step = 1, next_at = ?, updated_at = ? WHERE id = ?"
      : "UPDATE enrollments SET step = 1, status = 'completed', next_at = ?, updated_at = ? WHERE id = ?")
      .bind(next ? addHours(nowIso(), next.delayHours) : nowIso(), nowIso(), claim.id).run();
  } else {
    await env.DB.prepare("UPDATE enrollments SET next_at = ?, updated_at = ? WHERE id = ?").bind(nowIso(), nowIso(), claim.id).run();
  }
}
