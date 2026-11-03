import type { Env } from "../env";
import { nowIso } from "../env";
import { b64urlDecode, hmacHex, safeEqual } from "../lib/crypto";
import { getById } from "../engine/contacts";
import { applySignals } from "../engine/enroll";
import { queueFeedback } from "../engine/feedback";
import { ciaTier, parseAttrs } from "../engine/derive";

/** GET /c/:sendId/:dest/:sig — log click, push to HUB, redirect with HUB identity restore + UTMs. */
export async function handleClick(env: Env, ctx: ExecutionContext, sendId: string, destB64: string, sig: string) {
  let dest: string;
  try { dest = b64urlDecode(destB64); } catch { return Response.redirect(env.SITE_URL, 302); }
  const expected = (await hmacHex(env.LINK_SECRET, `c|${sendId}|${dest}`)).slice(0, 24);
  if (!safeEqual(expected, sig) || !/^https?:\/\//i.test(dest)) return Response.redirect(env.SITE_URL, 302);

  const send = await env.DB.prepare("SELECT contact_id, sequence, template FROM sends WHERE id = ?")
    .bind(sendId).first<{ contact_id: number; sequence: string | null; template: string }>();
  const contact = send ? await getById(env, send.contact_id) : null;

  const u = new URL(dest);
  if (!u.searchParams.has("utm_source")) {
    u.searchParams.set("utm_source", "slee");
    u.searchParams.set("utm_medium", "email");
    if (send?.sequence) u.searchParams.set("utm_campaign", send.sequence);
    if (send?.template) u.searchParams.set("utm_content", send.template);
  }
  const identifyHosts = env.IDENTIFY_DOMAINS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (contact?.identify_qs && identifyHosts.includes(u.hostname.toLowerCase())) {
    for (const [k, v] of new URLSearchParams(contact.identify_qs)) u.searchParams.set(k, v);
  }

  if (contact && send) {
    ctx.waitUntil((async () => {
      const now = nowIso();
      const clicks = contact.clicks + 1;
      const cia = ciaTier({ ...contact, clicks }, parseAttrs(contact));
      await env.DB.batch([
        env.DB.prepare("INSERT INTO clicks (send_id, contact_id, url) VALUES (?,?,?)").bind(sendId, contact.id, dest),
        env.DB.prepare("UPDATE contacts SET clicks = ?, last_click_at = ?, cia_tier = ?, updated_at = ? WHERE id = ?")
          .bind(clicks, now, cia, now, contact.id),
      ]);
      await applySignals(env, { ...contact, clicks, cia_tier: cia }, ["email.clicked"]);
      await queueFeedback(env, contact, "email.clicked", { url: dest, sequence: send.sequence, template: send.template, cia_tier: cia });
    })());
  }
  return Response.redirect(u.toString(), 302);
}
