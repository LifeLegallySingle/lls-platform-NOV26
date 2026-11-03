import type { Env } from "../env";
import { html } from "../lib/http";
import { hmacHex, safeEqual } from "../lib/crypto";
import { getById } from "../engine/contacts";
import { suppress } from "../engine/suppress";
import { BRAND } from "../config";
import { esc } from "../templates/layout";

const page = (title: string, inner: string) => html(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="font:16px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:${BRAND.bg};color:${BRAND.ink};margin:0;padding:48px 16px;">
<div style="max-width:480px;margin:auto;background:#fff;border-radius:12px;padding:32px;"><h1 style="font:700 22px Georgia,serif;margin:0 0 12px;">${esc(title)}</h1>${inner}</div></body></html>`);

/** GET shows a confirm button; POST (incl. RFC 8058 one-click from Gmail/Yahoo) unsubscribes. */
export async function handleUnsub(req: Request, env: Env, ctx: ExecutionContext, id: string, sig: string) {
  const expected = (await hmacHex(env.LINK_SECRET, `u|${id}`)).slice(0, 24);
  if (!safeEqual(expected, sig)) return page("Link not valid", "<p>This unsubscribe link isn't valid. Reply to any email and we'll remove you.</p>");
  const c = await getById(env, Number(id));
  if (!c) return page("You're unsubscribed", "<p>You won't receive further emails.</p>");

  if (req.method === "POST") {
    await suppress(env, c.email, "unsubscribed", "link", ctx);
    return page("You're unsubscribed", `<p>${esc(c.email)} won't receive further emails from ${esc(BRAND.name)}.</p>`);
  }
  if (c.status === "unsubscribed") return page("You're already unsubscribed", "<p>Nothing else to do.</p>");
  return page("Unsubscribe?", `<p>Stop all emails to <strong>${esc(c.email)}</strong>?</p>
<form method="post"><button style="background:${BRAND.ink};color:#fff;border:0;border-radius:999px;padding:12px 22px;font-weight:600;cursor:pointer;">Unsubscribe</button></form>`);
}
