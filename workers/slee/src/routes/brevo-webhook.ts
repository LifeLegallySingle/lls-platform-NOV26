import type { Env } from "../env";
import { nowIso } from "../env";
import { json } from "../lib/http";
import { safeEqual } from "../lib/crypto";
import { suppress } from "../engine/suppress";
import { getByEmail } from "../engine/contacts";
import { DELIVERABILITY } from "../config";

/**
 * POST /v1/webhooks/brevo?token=… — Brevo transactional webhook.
 * Covers ALL Brevo transactional mail (SLEE + WP plugins). Every event is logged to bounce_log for metrics.
 *   hard bounce / invalid / blocked → suppressed (bounced)
 *   spam complaint                  → suppressed (complained)
 *   unsubscribed                    → suppressed (unsubscribed)
 *   soft bounce                     → counted; 2 in 30d = "unreliable" (still mailed); 3 in 30d = suppressed (liftable)
 */
const NORMALIZE: Record<string, string> = {
  hard_bounce: "hard_bounce", hardbounce: "hard_bounce", hard_bounced: "hard_bounce",
  soft_bounce: "soft_bounce", softbounce: "soft_bounce", soft_bounced: "soft_bounce",
  invalid_email: "invalid_email", invalid: "invalid_email",
  blocked: "blocked",
  spam: "spam", complaint: "spam",
  unsubscribed: "unsubscribed", unsubscribe: "unsubscribed",
};
const SUPPRESS_AS: Record<string, string> = {
  hard_bounce: "bounced", invalid_email: "bounced", blocked: "bounced", spam: "complained", unsubscribed: "unsubscribed",
};

export async function handleBrevoWebhook(req: Request, env: Env, ctx: ExecutionContext) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!env.BREVO_WEBHOOK_TOKEN || !safeEqual(token, env.BREVO_WEBHOOK_TOKEN)) return json({ ok: false }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const items: any[] = (Array.isArray(body) ? body : [body]).slice(0, 5);
  const out = { logged: 0, suppressed: 0, soft: 0, ignored: 0 };

  for (const it of items) {
    const type = NORMALIZE[String(it?.event ?? "").toLowerCase().replace(/\s+/g, "_")];
    const email = String(it?.email ?? "").trim().toLowerCase();
    if (!type || !email) { out.ignored++; continue; }

    await env.DB.prepare("INSERT INTO bounce_log (email, type, reason, message_id) VALUES (?,?,?,?)")
      .bind(email, type, it?.reason ? String(it.reason).slice(0, 300) : null, it?.["message-id"] ? String(it["message-id"]) : null).run();
    out.logged++;

    if (type === "soft_bounce") { await softBounce(env, email, ctx); out.soft++; continue; }
    await suppress(env, email, SUPPRESS_AS[type], "brevo_webhook", ctx);
    out.suppressed++;
  }
  return json({ ok: true, ...out });
}

async function softBounce(env: Env, email: string, ctx: ExecutionContext) {
  const c = await getByEmail(env, email);
  if (!c) return; // logged for metrics; not a SLEE contact yet
  const now = nowIso();
  const windowStart = new Date(Date.now() - DELIVERABILITY.softBounceWindowDays * 864e5).toISOString();
  const count = c.last_soft_bounce_at && c.last_soft_bounce_at >= windowStart ? c.soft_bounces + 1 : 1;
  const deliverability = count >= DELIVERABILITY.unreliableAt ? "unreliable" : c.deliverability;
  await env.DB.prepare("UPDATE contacts SET soft_bounces = ?, last_soft_bounce_at = ?, deliverability = ?, updated_at = ? WHERE id = ?")
    .bind(count, now, deliverability, now, c.id).run();
  if (count >= DELIVERABILITY.suppressAt && c.status === "active") await suppress(env, email, "soft_bounce", "brevo_webhook", ctx);
}
