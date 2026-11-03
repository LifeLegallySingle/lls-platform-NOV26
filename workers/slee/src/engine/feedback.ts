import type { Contact, Env } from "../env";
import { nowIso } from "../env";
import { signedHeaders } from "../lib/crypto";

/** SLEE -> HUB: engagement events land back on the HUB identity (closes the loop for CIA scoring). */
export async function queueFeedback(env: Env, c: Pick<Contact, "email" | "hub_id">, type: string, data: Record<string, unknown> = {}) {
  if (!env.HUB_FEEDBACK_URL) return;
  const payload = { v: 1, type, email: c.email, hub_id: c.hub_id, occurred_at: nowIso(), source: "slee", data };
  await env.DB.prepare("INSERT INTO feedback_outbox (payload) VALUES (?)").bind(JSON.stringify(payload)).run();
}

export async function flushFeedback(env: Env, limit = 10) {
  if (!env.HUB_FEEDBACK_URL) return { sent: 0, failed: 0 };
  const { results } = await env.DB.prepare(
    "SELECT id, payload, attempts FROM feedback_outbox WHERE next_at <= ? AND attempts < 12 ORDER BY id LIMIT ?"
  ).bind(nowIso(), limit).all<{ id: number; payload: string; attempts: number }>();
  let sent = 0, failed = 0;
  for (const row of results) {
    let err = "";
    try {
      const r = await fetch(env.HUB_FEEDBACK_URL, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await signedHeaders(env.HUB_SHARED_SECRET, row.payload)) },
        body: row.payload,
      });
      if (r.ok) {
        await env.DB.prepare("DELETE FROM feedback_outbox WHERE id = ?").bind(row.id).run();
        sent++;
        continue;
      }
      err = `HTTP ${r.status}`;
    } catch (e) {
      err = String(e);
    }
    failed++;
    const backoffMin = Math.min(2 ** row.attempts * 5, 720); // 5m → 12h
    await env.DB.prepare("UPDATE feedback_outbox SET attempts = attempts + 1, last_error = ?, next_at = ? WHERE id = ?")
      .bind(err.slice(0, 300), new Date(Date.now() + backoffMin * 60_000).toISOString(), row.id).run();
  }
  return { sent, failed };
}
