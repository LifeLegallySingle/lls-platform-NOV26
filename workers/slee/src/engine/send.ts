import type { Contact, Env } from "../env";
import { isDry, nowIso } from "../env";
import { brevoSend } from "../lib/brevo";
import { TEMPLATES, type TCtx } from "../templates";
import { htmlToText, layout } from "../templates/layout";
import { absolute, clickUrl, unsubUrl } from "./links";
import { parseAttrs } from "./derive";

export async function render(env: Env, c: Contact, templateId: string, sendId: string) {
  const tpl = TEMPLATES[templateId];
  if (!tpl) throw new Error(`unknown template ${templateId}`);
  const links: string[] = [];
  const ctx: TCtx = {
    c,
    attrs: parseAttrs(c),
    first: c.firstname ? `Hi ${c.firstname}` : "Hi there",
    url: (path) => { links.push(absolute(env, path)); return `__SLEE_L${links.length - 1}__`; },
  };
  const r = tpl(ctx);
  const unsub = await unsubUrl(env, c.id);
  let html = layout({ preheader: r.preheader, body: r.body, unsubUrl: unsub, address: env.MAIL_ADDRESS });
  for (let i = 0; i < links.length; i++) html = html.replaceAll(`__SLEE_L${i}__`, await clickUrl(env, sendId, links[i]));
  return { subject: r.subject, html, text: htmlToText(html), unsub };
}

export async function sendTemplate(
  env: Env, c: Contact, templateId: string,
  meta: { sequence?: string; step?: number; enrollmentId?: number } = {}
): Promise<{ ok: boolean; sendId: string; status: string; error?: string }> {
  const sendId = crypto.randomUUID().replace(/-/g, "");
  const msg = await render(env, c, templateId, sendId);
  let status = "dry_run", providerId: string | null = null, error: string | null = null;

  const liveOverride = (env.LIVE_TEMPLATES || "").split(",").map((s) => s.trim()).filter(Boolean).includes(templateId);
  if (!isDry(env) || liveOverride) {
    const r = await brevoSend(env, {
      to: c.email, toName: c.firstname ?? undefined, subject: msg.subject, html: msg.html, text: msg.text,
      unsubUrl: msg.unsub, sendId, tags: [meta.sequence ?? "manual", templateId],
    });
    status = r.ok ? "sent" : "failed";
    providerId = r.id ?? null;
    error = r.error ?? null;
  }

  const now = nowIso();
  const stmts = [
    env.DB.prepare(
      "INSERT INTO sends (id, contact_id, enrollment_id, sequence, step, template, subject, provider_id, status, error, sent_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(sendId, c.id, meta.enrollmentId ?? null, meta.sequence ?? null, meta.step ?? null, templateId, msg.subject, providerId, status, error, now),
  ];
  if (status !== "failed") stmts.push(env.DB.prepare("UPDATE contacts SET last_sent_at = ? WHERE id = ?").bind(now, c.id));
  await env.DB.batch(stmts);
  return { ok: status !== "failed", sendId, status, error: error ?? undefined };
}
