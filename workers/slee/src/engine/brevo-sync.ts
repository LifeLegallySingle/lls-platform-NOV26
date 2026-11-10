import type { Contact, Env, SleeEvent } from "../env";
import { nowIso } from "../env";
import { BREVO_SYNC } from "../config";
import { brevoApi } from "../lib/brevo";
import { parseAttrs } from "./derive";

/**
 * SLEE → Brevo: SLEE is the single point of entry; Brevo gets a secondary copy.
 * Upserts the contact (POST /v3/contacts, updateEnabled) into the list for its entry source.
 * Never blocks ingest: failures go to feedback_outbox (target='brevo') and retry from the cron.
 */
const PRODUCT_SOURCE: Record<string, string> = {
  sah_quiz: "sah_quiz",
  glotype: "glotype",
  power_move_optin: "power_move_optin",
  power_move: "power_move_optin",
  freedom_tax: "freedom_tax",
  freedom_tax_calculator: "freedom_tax",
};

/** Entry source for an event, or null when it shouldn't reach Brevo (e.g. account sign-ins with no opt-in). */
export function sourceForEvent(ev: Pick<SleeEvent, "product" | "attrs" | "type">): string | null {
  // Any form source is accepted (e.g. dating_waitlist, memes); list comes from brevo_lists / BREVO_LIST_MAP.
  const raw = typeof ev.attrs.optin_source === "string" ? ev.attrs.optin_source : "";
  const optin = raw.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40);
  if (optin) return optin;
  const p = (ev.product || "").toLowerCase();
  if (PRODUCT_SOURCE[p]) return PRODUCT_SOURCE[p];
  if (p === "hub_optin" || p === "lls_hub_optin" || ev.type === "optin.subscribed") return "site_optin";
  return null;
}

function overrides(env: Env): Record<string, number> {
  try { return env.BREVO_LIST_MAP ? JSON.parse(env.BREVO_LIST_MAP) : {}; } catch { return {}; }
}

async function api(env: Env, method: string, path: string, body?: unknown) {
  const r = await fetch(`${brevoApi(env)}${path}`, {
    method,
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

/** Cron: make sure every source has a Brevo list (find by name in folder "SLEE", else create). ~10 subrequests once. */
export async function ensureBrevoLists(env: Env) {
  if (!env.BREVO_API_KEY) return { skipped: "no_api_key" };
  const have = await env.DB.prepare("SELECT source FROM brevo_lists").all<{ source: string }>();
  const known = new Set(have.results.map((r) => r.source));
  const ov = overrides(env);
  const missing = BREVO_SYNC.knownSources.filter((s) => !known.has(s));
  if (!missing.length) return { ok: true, created: 0 };

  // Explicit overrides first (no API calls).
  const stmts = [];
  for (const s of missing.filter((s) => ov[s])) {
    stmts.push(env.DB.prepare("INSERT OR REPLACE INTO brevo_lists (source, list_id, name) VALUES (?,?,?)").bind(s, Number(ov[s]), "override"));
  }
  if (stmts.length) await env.DB.batch(stmts);
  const todo = missing.filter((s) => !ov[s]);
  if (!todo.length) return { ok: true, created: 0 };

  // Folder
  const folders = await api(env, "GET", "/contacts/folders?limit=50&offset=0");
  if (!folders.ok) return { ok: false, error: `folders ${folders.status}` };
  let folderId = (folders.data?.folders ?? []).find((f: any) => f.name === BREVO_SYNC.folderName)?.id;
  if (!folderId) {
    const f = await api(env, "POST", "/contacts/folders", { name: BREVO_SYNC.folderName });
    if (!f.ok) return { ok: false, error: `create folder ${f.status}` };
    folderId = f.data?.id;
  }

  // Existing lists (by exact name), up to 200
  const byName = new Map<string, number>();
  for (let off = 0; off < 200; off += 50) {
    const l = await api(env, "GET", `/contacts/lists?limit=50&offset=${off}`);
    if (!l.ok) break;
    for (const x of l.data?.lists ?? []) byName.set(x.name, x.id);
    if ((l.data?.lists ?? []).length < 50) break;
  }

  let created = 0;
  for (const s of todo) {
    const name = BREVO_SYNC.listName(s);
    let id = byName.get(name);
    if (!id) {
      const c = await api(env, "POST", "/contacts/lists", { name, folderId });
      if (!c.ok) continue;
      id = c.data?.id; created++;
    }
    if (id) await env.DB.prepare("INSERT OR REPLACE INTO brevo_lists (source, list_id, name) VALUES (?,?,?)").bind(s, id, name).run();
  }
  return { ok: true, created };
}

/** Upsert one contact into Brevo. Returns 'ok' | 'retry' | 'fail' (4xx: don't retry). */
export async function upsertBrevoContact(env: Env, c: Contact, source: string): Promise<"ok" | "retry" | "fail"> {
  if (!env.BREVO_API_KEY) return "retry";
  if (c.status !== "active") {
    await env.DB.prepare("UPDATE contacts SET brevo_error = ? WHERE id = ?").bind(`skipped: contact is ${c.status}`, c.id).run();
    return "ok"; // never (re)add suppressed people to lists
  }
  let row = await env.DB.prepare("SELECT list_id FROM brevo_lists WHERE source = ?").bind(source).first<{ list_id: number }>();
  const ov = overrides(env)[source];
  if (ov) row = { list_id: Number(ov) };
  if (!row) {
    // Option B: first signup from a new form source creates its own list ("SLEE · <source>").
    const id = await ensureListFor(env, source);
    if (id) row = { list_id: id };
  }
  if (!row) {
    await env.DB.prepare("UPDATE contacts SET brevo_error = ? WHERE id = ?")
      .bind(`waiting: could not create Brevo list for source '${source}'`, c.id).run();
    return "retry";
  }

  const a = parseAttrs(c);
  const attributes: Record<string, unknown> = { SOURCE: source };
  if (c.firstname) attributes.FIRSTNAME = c.firstname;
  if (c.sah_score != null) attributes.SAH_SCORE = c.sah_score;
  if (c.glotype) attributes.GLOTYPE_ELEMENT = c.glotype;     // existing Brevo attribute name
  if (c.power_move) attributes.POWER_MOVE = c.power_move;
  if (typeof a.page_source === "string" && /^https?:\/\//i.test(a.page_source)) attributes.PAGE_SOURCE = a.page_source;

  const r = await api(env, "POST", "/contacts", { email: c.email, attributes, listIds: [row.list_id], updateEnabled: true });
  const now = nowIso();
  if (r.ok) {
    await env.DB.prepare("UPDATE contacts SET brevo_synced_at = ?, brevo_error = NULL WHERE id = ?").bind(now, c.id).run();
    return "ok";
  }
  const err = `${r.status}: ${typeof r.data === "string" ? r.data : JSON.stringify(r.data)}`.slice(0, 300);
  await env.DB.prepare("UPDATE contacts SET brevo_error = ? WHERE id = ?").bind(err, c.id).run();
  return r.status === 429 || r.status >= 500 ? "retry" : "fail";
}

/** Called after ingest (inside waitUntil). Never throws. */
export async function syncToBrevo(env: Env, c: Contact, source: string | null) {
  if (!source) return;
  try {
    const res = await upsertBrevoContact(env, c, source);
    if (res === "retry") await queueBrevo(env, c.id, source);
  } catch (e) {
    await queueBrevo(env, c.id, source).catch(() => {});
  }
}

export async function queueBrevo(env: Env, contactId: number, source: string) {
  await env.DB.prepare("INSERT INTO feedback_outbox (target, payload) VALUES ('brevo', ?)")
    .bind(JSON.stringify({ contact_id: contactId, source })).run();
}

/** No opt-in source (e.g. Google sign-in, identity restore): record why, so nothing is silent. */
export async function markBrevoSkipped(env: Env, c: Contact, reason: string) {
  if (c.brevo_synced_at) return;
  await env.DB.prepare("UPDATE contacts SET brevo_error = ? WHERE id = ? AND brevo_synced_at IS NULL")
    .bind(`skipped: ${reason}`.slice(0, 300), c.id).run();
}

/** Find or create the Brevo list for one source (in folder "SLEE") and remember it in brevo_lists. */
export async function ensureListFor(env: Env, source: string): Promise<number | null> {
  if (!env.BREVO_API_KEY) return null;
  const name = BREVO_SYNC.listName(source);
  const folders = await api(env, "GET", "/contacts/folders?limit=50&offset=0");
  if (!folders.ok) return null;
  let folderId = (folders.data?.folders ?? []).find((f: any) => f.name === BREVO_SYNC.folderName)?.id;
  if (!folderId) {
    const f = await api(env, "POST", "/contacts/folders", { name: BREVO_SYNC.folderName });
    if (!f.ok) return null;
    folderId = f.data?.id;
  }
  let id: number | undefined;
  for (let off = 0; off < 200 && !id; off += 50) {
    const l = await api(env, "GET", `/contacts/lists?limit=50&offset=${off}`);
    if (!l.ok) break;
    id = (l.data?.lists ?? []).find((x: any) => x.name === name)?.id;
    if ((l.data?.lists ?? []).length < 50) break;
  }
  if (!id) {
    const c = await api(env, "POST", "/contacts/lists", { name, folderId });
    if (!c.ok) return null;
    id = c.data?.id;
  }
  if (!id) return null;
  await env.DB.prepare("INSERT OR REPLACE INTO brevo_lists (source, list_id, name) VALUES (?,?,?)").bind(source, id, name).run();
  return id;
}
