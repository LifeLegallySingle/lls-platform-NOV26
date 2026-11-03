import { BRAND } from "../config";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function layout(o: { preheader: string; body: string; unsubUrl: string; address: string }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(BRAND.name)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preheader)}&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.card};border-radius:12px;">
<tr><td style="padding:28px 32px 8px;font:600 13px/1.4 Georgia,'Times New Roman',serif;letter-spacing:.12em;text-transform:uppercase;color:${BRAND.accent};">${esc(BRAND.name)}</td></tr>
<tr><td style="padding:8px 32px 28px;font:16px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${BRAND.ink};">
${o.body}
<p style="margin:28px 0 0;color:${BRAND.muted};">${esc(BRAND.signoff)}</p>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;"><tr><td style="padding:16px 32px;font:12px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${BRAND.muted};text-align:center;">
You're getting this because you joined ${esc(BRAND.name)}.<br>${esc(o.address)}<br>
<a href="${o.unsubUrl}" style="color:${BRAND.muted};">Unsubscribe</a>
</td></tr></table>
</td></tr></table></body></html>`;
}

export function htmlToText(h: string) {
  return h
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<(br|\/p|\/h\d|\/li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
