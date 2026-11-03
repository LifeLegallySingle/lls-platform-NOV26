import type { Env } from "../env";
import { nowIso } from "../env";
import { json } from "../lib/http";
import { safeEqual } from "../lib/crypto";
import { suppress } from "../engine/suppress";
import { getByEmail } from "../engine/contacts";
import { DELIVERABILITY } from "../config";

/**
 * POST /v1/webhooks/brevo?token=… — Brevo transactional webhook (SLEE + WP plugin mail).
 * Every event → email_events (analytics; capped per day). List-protection events are ALWAYS processed:
 *   hard bounce / invalid / blocked → suppressed (bounced)
 *   spam complaint                  → suppressed (complained)
 *   unsubscribed                    → suppressed (unsubscribed)
 *   soft bounce                     → counted; 2 in 30d = "unreliable" (still mailed); 3 in 30d = suppressed (liftable)
 */
const NORMALIZE: Record<string, string> = {
  request: "sent", sent: "sent",
  delivered: "delivered",
  deferred: "deferred",
  hard_bounce: "hard_bounce", hardbounce: "hard_bounce", hard_bounced: "hard_bounce",
  soft_bounce: "soft_bounce", softbounce: "soft_bounce", soft_bounced: "soft_bounce",
  invalid_email: "invalid_email", invalid: "invalid_email",
  blocked: "blocked",
  spam: "spam", complaint: "spam",
  unsubscribed: "unsubscribed", unsubscribe: "unsubscribed",
  first_opening: "first_opening", firstopening: "first_opening", first_opened: "first_opening",
  unique_opened: "unique_opened", uniqueopened: "unique_opened",
  opened: "opened", open: "opened",
  click: "clicked", clicked: "clicked", clicks: "clicked",
  error: "error",
  proxy_open: "proxy_open", loaded_by_proxy: "proxy_open", unique_proxy_open: "proxy_open",
};
const SUPPRESS_AS: Record<string, string> = {
  hard_bounce: "bounced", invalid_email: "bounced", blocked: "bounced", spam: "complained", unsubscribed: "unsubscribed",
};
const CRITICAL = new Set(["soft_bounce", ...Object.keys(SUPPRESS_AS)]);

export async function handleBrevoWebhook(req: Request, env: Env, ctx: ExecutionContext) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!env.BREVO_WEBHOOK_TOKEN || !safeEqual(token, env.BREVO_WEBHOOK_TOKEN)) return json({ ok: false }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const items: any[] = (Array.isArray(body) ? body : [body]).slice(0, 5);
  const out = { logged: 0, skipped_cap: 0, suppressed: 0, soft: 0, ignored: 0 };

  for (const it of items) {
    const type = NORMALIZE[String(it?.event ?? "").toLowerCase().replace(/[\s-]+/g, "_")];
    const email = String(it?.email ?? "").trim().toLowerCase();
    if (!type || !email.includes("@")) { out.ignored++; continue; }

    if (await shouldStore(env, type)) {
      const tags = Array.isArray(it?.tags) ? it.tags.join(",") : it?.tag ?? it?.tags ?? null;
      await env.DB.prepare("INSERT INTO email_events (email, domain, type, reason, message_id, tag) VALUES (?,?,?,?,?,?)")
        .bind(email, email.split("@")[1], type,
          it?.reason ? String(it.reason).slice(0, 300) : null,
          it?.["message-id"] ? String(it["message-id"]) : null,
          tags ? String(tags).slice(0, 200) : null).run();
      out.logged++;
    } else out.skipped_cap++;

    if (type === "soft_bounce") { await softBounce(env, email, ctx); out.soft++; continue; }
    if (SUPPRESS_AS[type]) { await suppress(env, email, SUPPRESS_AS[type], "brevo_webhook", ctx); out.suppressed++; }
  }
  return json({ ok: true, ...out });
}

/** Critical events always stored; analytics events stop at the daily cap (free-plan write budget). */
async function shouldStore(env: Env, type: string): Promise<boolean> {
  if (CRITICAL.has(type)) return true;
  const day = nowIso().slice(0, 10);
  const r = await env.DB.prepare(
    "INSERT INTO daily_counters (day, key, n) VALUES (?, 'email_events', 1) ON CONFLICT(day, key) DO UPDATE SET n = n + 1 RETURNING n"
  ).bind(day).first<{ n: number }>();
  return (r?.n ?? 0) <= DELIVERABILITY.maxAnalyticsEventsPerDay;
}

async function softBounce(env: Env, email: string, ctx: ExecutionContext) {
  const c = await getByEmail(env, email);
  if (!c) return; // stored for metrics; not a SLEE contact yet
  const now = nowIso();
  const windowStart = new Date(Date.now() - DELIVERABILITY.softBounceWindowDays * 864e5).toISOString();
  const count = c.last_soft_bounce_at && c.last_soft_bounce_at >= windowStart ? c.soft_bounces + 1 : 1;
  const deliverability = count >= DELIVERABILITY.unreliableAt ? "unreliable" : c.deliverability;
  await env.DB.prepare("UPDATE contacts SET soft_bounces = ?, last_soft_bounce_at = ?, deliverability = ?, updated_at = ? WHERE id = ?")
    .bind(count, now, deliverability, now, c.id).run();
  if (count >= DELIVERABILITY.suppressAt && c.status === "active") await suppress(env, email, "soft_bounce", "brevo_webhook", ctx);
}
