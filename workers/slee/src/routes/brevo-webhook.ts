import type { Env } from "../env";
import { json } from "../lib/http";
import { safeEqual } from "../lib/crypto";
import { suppress } from "../engine/suppress";

/** POST /v1/webhooks/brevo?token=… — Brevo transactional webhook → suppression list. */
const MAP: Record<string, string> = {
  hard_bounce: "bounced", hardbounce: "bounced", invalid_email: "bounced", blocked: "bounced",
  spam: "complained", complaint: "complained",
  unsubscribed: "unsubscribed", unsubscribe: "unsubscribed",
};

export async function handleBrevoWebhook(req: Request, env: Env, ctx: ExecutionContext) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!env.BREVO_WEBHOOK_TOKEN || !safeEqual(token, env.BREVO_WEBHOOK_TOKEN)) return json({ ok: false }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const items: any[] = Array.isArray(body) ? body : [body];
  let handled = 0;
  for (const it of items) {
    const reason = MAP[String(it?.event ?? "").toLowerCase()];
    const email = String(it?.email ?? "").toLowerCase();
    if (reason && email) { await suppress(env, email, reason, "brevo_webhook", ctx); handled++; }
  }
  return json({ ok: true, handled });
}
