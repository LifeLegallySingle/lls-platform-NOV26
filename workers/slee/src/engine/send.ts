import type { Contact, Env } from "../env";
import { isDry, nowIso } from "../env";
import { brevoSend } from "../lib/brevo";
import { b64urlDecode } from "../lib/crypto";
import { TEMPLATES, type TCtx } from "../templates";
import { campaignLayout, htmlToText, layout } from "../templates/layout";
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
  const lay = r.layout === "campaign" ? campaignLayout : layout;
  let html = lay({ preheader: r.preheader, body: r.body, unsubUrl: unsub, address: env.MAIL_ADDRESS });
  for (let i = 0; i < links.length; i++) html = html.replaceAll(`__SLEE_L${i}__`, await clickUrl(env, sendId, links[i]));
  return { subject: r.subject, html, text: htmlToText(html), unsub };
}

export async function sendTemplate(
  env: Env, c: Contact, templateId: string,
  meta: { sequence?: string; step?: number; enrollmentId?: number; forceLive?: boolean } = {}
): Promise<{ ok: boolean; sendId: string; status: string; error?: string }> {
  const sendId = crypto.randomUUID().replace(/-/g, "");
  const msg = await render(env, c, templateId, sendId);
  let status = "dry_run", providerId: string | null = null, error: string | null = null;

  const liveOverride = (env.LIVE_TEMPLATES || "").split(",").map((s) => s.trim()).filter(Boolean).includes(templateId);
  if (!isDry(env) || liveOverride || meta.forceLive) {
    const r = await brevoSend(env, {
      to: c.email, toName: c.firstname ?? undefined, subject: msg.subject, html: msg.html, text: msg.text,
      unsubUrl: msg.unsub, sendId, tags: [meta.sequence ?? "manual", templateId],
    });
    status = r.ok ? "sent" : "failed";
    if (r.ok && env.MONITOR_EMAIL && env.MONITOR_EMAIL.toLowerCase() !== c.email.toLowerCase()) {
      await sendMonitorCopy(env, c.email, templateId, msg).catch(() => {});
    }
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

/** Safe copy for the monitor inbox: tracked links → plain destinations, unsubscribe disabled, not logged as a send. */
async function sendMonitorCopy(env: Env, recipient: string, templateId: string, msg: { subject: string; html: string; text: string; unsub: string }) {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const plain = (s: string) => s
    .replace(new RegExp(base + "/c/[^/]+/([A-Za-z0-9_-]+)/[a-f0-9]+", "g"), (_m, b64) => { try { return b64urlDecode(b64); } catch { return "#"; } })
    .split(msg.unsub).join("#monitor-copy-unsubscribe-disabled");
  const banner = `<div style="background:#141414;color:#fff;font:13px/1.4 Arial,sans-serif;padding:10px 14px;">SLEE monitor copy · sent to <b>${recipient}</b> · email <b>${templateId}</b> · links are plain, unsubscribe disabled</div>`;
  const html = plain(msg.html).replace(/<body([^>]*)>/i, `<body$1>${banner}`);
  await brevoSend(env, {
    to: env.MONITOR_EMAIL!, subject: `[SLEE → ${recipient} · ${templateId}] ${msg.subject}`, html, text: plain(msg.text),
    unsubUrl: `${env.PUBLIC_BASE_URL}/monitor-copy`, sendId: "monitor", tags: ["slee-monitor", templateId],
  });
}

/** Real preview: renders with a real recipient's data, delivers only to `to` (not logged as a send). */
export async function sendPreview(env: Env, c: Contact, templateId: string, to: string) {
  const msg = await render(env, c, templateId, "preview");
  return brevoSend(env, { to, subject: `[PREVIEW → ${c.email}] ${msg.subject}`, html: msg.html, text: msg.text,
    unsubUrl: msg.unsub, sendId: "preview", tags: ["slee-preview", templateId] });
}
