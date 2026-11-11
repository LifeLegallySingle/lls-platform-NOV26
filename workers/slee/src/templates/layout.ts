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
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<div style="display:none[^"]*">[\s\S]*?<\/div>/i, "") // hidden preheader
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<(br|\/p|\/h\d|\/li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")
    .replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Campaign layout ("editorial minimal"): white canvas, black wordmark bar, uppercase micro-labels, purple accents. */
export function campaignLayout(o: { preheader: string; body: string; unsubUrl: string; address: string }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(BRAND.name)}</title></head>
<body style="margin:0;padding:0;background:#FFFFFF;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preheader)}&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td style="background:#000000;padding:14px 28px;text-align:center;">
<a href="https://legallysingle.com/" style="text-decoration:none;"><img src="${BRAND.logoUrl}" width="104" height="104" alt="Life Legally Single" style="display:block;margin:0 auto;border:0;width:104px;height:104px;"></a></td></tr>
<tr><td style="padding:44px 28px 8px;font:16px/1.65 Helvetica,Arial,sans-serif;color:#0A0A0A;">
${o.body}
</td></tr>
<tr><td style="padding:28px 28px 40px;border-top:1px solid #EAEAEA;text-align:center;font:11px/1.7 Helvetica,Arial,sans-serif;letter-spacing:.06em;color:#8A8A8A;">
<span style="text-transform:uppercase;letter-spacing:.22em;color:#0A0A0A;">Being single is a Power Move™</span><br><br>
You’re getting this because you used a Life Legally Single™ tool.<br>${esc(o.address)}<br>
<a href="${o.unsubUrl}" style="color:#8A8A8A;">Unsubscribe</a>
</td></tr></table>
</td></tr></table></body></html>`;
}
