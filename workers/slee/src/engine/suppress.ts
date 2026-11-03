import type { Env } from "../env";
import { nowIso } from "../env";
import { brevoBlacklist } from "../lib/brevo";
import { getByEmail } from "./contacts";
import { exitAll } from "./enroll";
import { queueFeedback } from "./feedback";

const STATUS_FOR: Record<string, string> = {
  unsubscribed: "unsubscribed", bounced: "bounced", complained: "complained",
};

export async function suppress(env: Env, email: string, reason: string, source: string, ctx?: ExecutionContext) {
  email = email.toLowerCase();
  const status = STATUS_FOR[reason] ?? "suppressed";
  await env.DB.batch([
    env.DB.prepare("INSERT OR REPLACE INTO suppressions (email, reason, source, created_at) VALUES (?,?,?,?)").bind(email, reason, source, nowIso()),
    env.DB.prepare("UPDATE contacts SET status = ?, updated_at = ? WHERE email = ?").bind(status, nowIso(), email),
  ]);
  const c = await getByEmail(env, email);
  if (c) {
    await exitAll(env, c.id, reason);
    if (reason !== "bot" && reason !== "suspect") await queueFeedback(env, c, `email.${reason}`, { source });
  }
  if (reason === "unsubscribed" || reason === "complained") {
    const p = brevoBlacklist(env, email);
    ctx ? ctx.waitUntil(p) : await p;
  }
}
