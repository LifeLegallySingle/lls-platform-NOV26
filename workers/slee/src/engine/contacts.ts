import type { Contact, Env, SleeEvent } from "../env";
import { nowIso } from "../env";
import { ciaTier, parseAttrs, sahTier, toNum, toStr } from "./derive";

export async function getByEmail(env: Env, email: string): Promise<Contact | null> {
  return env.DB.prepare("SELECT * FROM contacts WHERE email = ?").bind(email.toLowerCase()).first<Contact>();
}
export async function getById(env: Env, id: number): Promise<Contact | null> {
  return env.DB.prepare("SELECT * FROM contacts WHERE id = ?").bind(id).first<Contact>();
}

/** Drop empty values so partial writes never erase known data (mirrors HUB's additive array_merge). */
function clean(a: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) if (v !== null && v !== undefined && v !== "") out[k] = v;
  return out;
}

export async function upsertContact(
  env: Env,
  ev: Pick<SleeEvent, "email" | "attrs" | "hub_id" | "identify_qs">,
  opts: { cohort?: string; quality?: string; status?: string } = {}
): Promise<{ before: Contact | null; after: Contact }> {
  const before = await getByEmail(env, ev.email);
  const attrs = { ...parseAttrs(before), ...clean(ev.attrs) };
  const sah_score = toNum(attrs.sah_score);
  const glotype = toStr(attrs.glotype_element);
  const power_move = toStr(attrs.power_move);
  const firstname = toStr(attrs.firstname) ?? before?.firstname ?? null;
  const clicks = before?.clicks ?? 0;
  const cia = ciaTier({ sah_score, glotype, power_move, clicks }, attrs);
  const tier = sahTier(sah_score, attrs.sah_status);
  const now = nowIso();

  if (!before) {
    const suppressed = await env.DB.prepare("SELECT reason FROM suppressions WHERE email = ?").bind(ev.email).first<{ reason: string }>();
    const status = opts.status ?? (suppressed ? "suppressed" : "active");
    const after = await env.DB.prepare(
      `INSERT INTO contacts (email, hub_id, firstname, attrs, sah_score, sah_tier, glotype, power_move, cia_tier, cohort, quality, identify_qs, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`
    ).bind(ev.email, ev.hub_id ?? null, firstname, JSON.stringify(attrs), sah_score, tier, glotype, power_move, cia,
      opts.cohort ?? null, opts.quality ?? "ok", ev.identify_qs ?? null, status, now, now).first<Contact>();
    return { before: null, after: after! };
  }

  const after = await env.DB.prepare(
    `UPDATE contacts SET hub_id = COALESCE(?, hub_id), firstname = ?, attrs = ?, sah_score = ?, sah_tier = ?, glotype = ?,
       power_move = ?, cia_tier = ?, cohort = COALESCE(?, cohort), quality = COALESCE(?, quality),
       identify_qs = COALESCE(?, identify_qs), status = COALESCE(?, status), updated_at = ?
     WHERE id = ? RETURNING *`
  ).bind(ev.hub_id ?? null, firstname, JSON.stringify(attrs), sah_score, tier, glotype, power_move, cia,
    opts.cohort ?? null, opts.quality ?? null, ev.identify_qs ?? null, opts.status ?? null, now, before.id).first<Contact>();
  return { before, after: after! };
}

/**
 * The "magic": SLEE reacts to what CHANGED on the identity, not just the event label.
 * So a generic HUB identity write that adds an SAH score still triggers the SAH journey.
 */
export function inferSignals(type: string, before: Contact | null, after: Contact): string[] {
  const s = new Set<string>();
  if (type && type !== "identity.updated") s.add(type);
  const a0 = parseAttrs(before), a1 = parseAttrs(after);
  if (after.sah_score != null && before?.sah_score == null) s.add("sah_quiz.completed");
  if (after.glotype && !before?.glotype) s.add("glotype.completed");
  if (after.power_move && after.power_move !== before?.power_move) s.add("power_move.optin");
  if (a1.str_freedom_tax != null && a0.str_freedom_tax == null) s.add("freedom_tax.calculated");
  if (a1.datebase_city != null && a0.datebase_city == null) s.add("datebase.matched");
  if (!before) s.add("contact.created");
  return [...s];
}

/** Product/opt-in activity proves a real, engaged person — lets bot/sunset suppressions lift (never legal ones). */
export const REACTIVATING_SIGNALS = new Set([
  "sah_quiz.completed", "glotype.completed", "power_move.optin", "freedom_tax.calculated",
  "datebase.matched", "optin.subscribed", "ailife.subscribed",
]);
export const LIFTABLE_REASONS = new Set(["bot", "suspect", "sunset"]);

export async function maybeReactivate(env: Env, c: Contact, signals: string[]): Promise<Contact> {
  if (c.status !== "suppressed" || !signals.some((x) => REACTIVATING_SIGNALS.has(x))) return c;
  const sup = await env.DB.prepare("SELECT reason FROM suppressions WHERE email = ?").bind(c.email).first<{ reason: string }>();
  if (sup && !LIFTABLE_REASONS.has(sup.reason)) return c;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM suppressions WHERE email = ?").bind(c.email),
    env.DB.prepare("UPDATE contacts SET status = 'active', quality = 'ok', updated_at = ? WHERE id = ?").bind(nowIso(), c.id),
  ]);
  return { ...c, status: "active", quality: "ok" };
}
