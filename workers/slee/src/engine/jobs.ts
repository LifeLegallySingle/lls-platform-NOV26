import type { Env } from "../env";
import { nowIso } from "../env";
import { brevoApi } from "../lib/brevo";
import { MARKETING_MIN_GAP_HOURS } from "../config";
import type { Contact } from "../env";
import { sendPreview, sendTemplate } from "./send";
import { TEMPLATES } from "../templates";

/**
 * One-off admin jobs, queued by inserting a row into slee_jobs (status 'pending'); the cron runs at most one per tick.
 *   fetch_brevo_templates            → copies Brevo transactional/opt-in templates into brevo_templates
 *   template_replace:<id>            → params {"subject"?: [[find, replace],...], "html"?: [[find, replace],...]}; PUT to Brevo, re-cache
 */
async function brevo(env: Env, method: string, path: string, body?: unknown) {
  const r = await fetch(`${brevoApi(env)}${path}`, {
    method, headers: { "api-key": env.BREVO_API_KEY, accept: "application/json", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  let d: any = null; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  return { ok: r.ok, status: r.status, data: d };
}

async function cacheTemplates(env: Env, list: any[]) {
  const rows = list.map((t) => ({ id: t.id, name: t.name ?? null, subject: t.subject ?? null, is_active: t.isActive ? 1 : 0,
    modified_at: t.modifiedAt ?? null, sender: t.sender?.email ?? null, html: String(t.htmlContent ?? "").slice(0, 90000) }));
  if (!rows.length) return 0;
  const v = (k: string) => `json_extract(j.value,'$.${k}')`;
  await env.DB.prepare(
    `INSERT OR REPLACE INTO brevo_templates (id, name, subject, is_active, modified_at, sender, html, fetched_at)
     SELECT ${v("id")}, ${v("name")}, ${v("subject")}, ${v("is_active")}, ${v("modified_at")}, ${v("sender")}, ${v("html")}, ?2 FROM json_each(?1) j`
  ).bind(JSON.stringify(rows), nowIso()).run();
  return rows.length;
}

export async function runOneJob(env: Env): Promise<{ job: string; status: string; result: string } | null> {
  const job = await env.DB.prepare("SELECT job, params FROM slee_jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1")
    .first<{ job: string; params: string | null }>();
  if (!job) return null;
  let status = "done", result = "";
  try {
    if (job.job === "fetch_brevo_templates") {
      const r = await brevo(env, "GET", "/smtp/templates?limit=100&offset=0&sort=desc");
      if (!r.ok) throw new Error(`brevo ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
      const n = await cacheTemplates(env, r.data?.templates ?? []);
      result = `cached ${n} of ${r.data?.count ?? "?"} templates`;
    } else if (job.job.startsWith("template_replace:")) {
      const id = Number(job.job.split(":")[1]);
      const p = JSON.parse(job.params || "{}") as { subject?: [string, string][]; html?: [string, string][] };
      const g = await brevo(env, "GET", `/smtp/templates/${id}`);
      if (!g.ok) throw new Error(`get ${g.status}`);
      let subject: string = g.data.subject ?? "", html: string = g.data.htmlContent ?? "";
      let changes = 0;
      for (const [f, t] of p.subject ?? []) { const c = subject.split(f).length - 1; changes += c; subject = subject.split(f).join(t); }
      for (const [f, t] of p.html ?? []) { const c = html.split(f).length - 1; changes += c; html = html.split(f).join(t); }
      if (!changes) { result = "no matches; nothing changed"; }
      else {
        const u = await brevo(env, "PUT", `/smtp/templates/${id}`, { subject, htmlContent: html });
        if (!u.ok) throw new Error(`put ${u.status}: ${JSON.stringify(u.data).slice(0, 200)}`);
        const again = await brevo(env, "GET", `/smtp/templates/${id}`);
        if (again.ok) await cacheTemplates(env, [again.data]);
        result = `updated template ${id}: ${changes} replacements`;
      }
    } else if (job.job === "sync_brevo_contacts") {
      result = await syncBrevoContacts(env, JSON.parse(job.params || "{}"));
      if (result.startsWith("more:")) {
        // re-queue the next page for the next tick
        const offset = Number(result.split(":")[1]);
        await env.DB.prepare("UPDATE slee_jobs SET status='pending', params=?, result=? WHERE job=?")
          .bind(JSON.stringify({ offset }), `in progress: offset ${offset}`, job.job).run();
        return { job: job.job, status: "pending", result };
      }
    } else if (job.job.startsWith("brevo_list_build:")) {
      result = await buildBrevoList(env, job.job.split(":")[1], JSON.parse(job.params || "{}"));
    } else if (job.job.startsWith("broadcast:")) {
      const r = await runBroadcast(env, job.job.split(":").slice(1).join(":"), JSON.parse(job.params || "{}"));
      if (r.startsWith("more:")) {
        await env.DB.prepare("UPDATE slee_jobs SET status='pending', result=? WHERE job=?").bind(r, job.job).run();
        return { job: job.job, status: "pending", result: r };
      }
      result = r;
    } else { status = "error"; result = "unknown job"; }
  } catch (e) { status = "error"; result = String(e).slice(0, 300); }
  await env.DB.prepare("UPDATE slee_jobs SET status = ?, result = ?, done_at = ? WHERE job = ?").bind(status, result, nowIso(), job.job).run();
  return { job: job.job, status, result };
}

/* ---------------- Brevo → SLEE contact import (paged, 500 per tick) ---------------- */
const COHORT_BY_LIST: Record<number, string> = { 2: "wave1", 27: "wave1", 13: "wave2", 7: "wave2", 19: "wave3", 15: "wave3", 75: "wave3", 4: "wave4" };
const gib = (v: unknown) => typeof v === "string" && /^[A-Za-z]{6,}$/.test(v) && (v.slice(1).match(/[A-Z]/g) || []).length >= 2;

async function syncBrevoContacts(env: Env, p: { offset?: number }): Promise<string> {
  const offset = p.offset ?? 0, limit = 150; // small pages: free plan = 10ms CPU per run
  const r = await brevo(env, "GET", `/contacts?limit=${limit}&offset=${offset}&sort=asc`);
  if (!r.ok) throw new Error(`brevo ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
  const list: any[] = r.data?.contacts ?? [];
  const rows = list.filter((c) => c.email && String(c.email).includes("@")).map((c) => {
    const a = c.attributes || {};
    const bot = gib(a.FIRSTNAME) || gib(a.CITY) || gib(a.SINGLE_REASON);
    const lists: number[] = c.listIds || [];
    const product = a.SAH_SCORE != null || a.GLOTYPE_ELEMENT || a.POWER_MOVE || a.STR_FREEDOM_TAX || a.PAGE_SOURCE;
    let cohort = "brevo-other";
    if (product) cohort = "brevo-product";
    else for (const id of [2, 27, 13, 7, 19, 15, 75, 4]) if (lists.includes(id)) { cohort = COHORT_BY_LIST[id]; break; }
    const quality = bot ? "bot" : "ok";
    const status = c.emailBlacklisted ? "suppressed" : bot ? "suppressed" : "active";
    const attrs: Record<string, unknown> = {
      brevo_id: c.id, brevo_created: c.createdAt, brevo_lists: lists, brevo_blacklisted: !!c.emailBlacklisted, imported_from: "brevo-api",
    };
    for (const [k, v] of [["sah_score", a.SAH_SCORE], ["sah_status", a.SAH_STATUS], ["glotype_element", a.GLOTYPE_ELEMENT], ["power_move", a.POWER_MOVE],
      ["str_freedom_tax", a.STR_FREEDOM_TAX], ["page_source", a.PAGE_SOURCE], ["firstname", bot ? null : a.FIRSTNAME]] as [string, unknown][]) {
      if (v !== null && v !== undefined && v !== "") attrs[k] = v;
    }
    return { email: String(c.email).toLowerCase(), firstname: bot ? null : (a.FIRSTNAME || null), attrs: JSON.stringify(attrs), cohort, quality, status,
      created: c.createdAt || nowIso(), blacklisted: c.emailBlacklisted ? 1 : 0 };
  });
  if (rows.length) {
    const J = JSON.stringify(rows), v = (k: string) => `json_extract(j.value,'$.${k}')`, now = nowIso();
    await env.DB.batch([
      // new people: insert; existing SLEE contacts: keep their data, just record Brevo list membership + blocklist flag
      env.DB.prepare(
        `INSERT INTO contacts (email, firstname, attrs, cohort, quality, status, created_at, updated_at)
         SELECT ${v("email")}, ${v("firstname")}, ${v("attrs")}, ${v("cohort")}, ${v("quality")}, ${v("status")}, ${v("created")}, ?2 FROM json_each(?1) j WHERE true
         ON CONFLICT(email) DO UPDATE SET attrs = json_set(contacts.attrs, '$.brevo_lists', json(json_extract(excluded.attrs,'$.brevo_lists')),
           '$.brevo_blacklisted', json(CASE WHEN json_extract(excluded.attrs,'$.brevo_blacklisted') THEN 'true' ELSE 'false' END)),
           status = CASE WHEN json_extract(excluded.attrs,'$.brevo_blacklisted') AND contacts.status = 'active' THEN 'suppressed' ELSE contacts.status END,
           updated_at = ?2`
      ).bind(J, now),
      env.DB.prepare(
        `INSERT OR IGNORE INTO suppressions (email, reason, source, created_at)
         SELECT ${v("email")}, CASE WHEN ${v("blacklisted")} = 1 THEN 'brevo_blocklisted' ELSE 'bot' END, 'brevo-import', ?2
         FROM json_each(?1) j WHERE ${v("status")} = 'suppressed'`
      ).bind(J, now),
    ]);
  }
  const total = Number(r.data?.count ?? 0), next = offset + list.length;
  return list.length === limit && next < total ? `more:${next}` : `done: ${next} of ${total} contacts`;
}

/* ---------------- SLEE segment → Brevo list ---------------- */
const NON_US_TLDS = ["uk","de","ca","jp","fr","in","be","it","au","nl","es","br","mx","ch","se","no","dk","ie","nz","za","sg","ph","pl","pt","at","ru","cn","kr","tw","hk","il","ae","ar","cl","fi","gr","hu","cz","ro","tr","ua","my","id","th","vn","pk","ng","ke","eg","sa","lt","lv","ee","sk","si","hr","rs","bg","lu","is"];
const NON_US_DOMAIN_SQL = NON_US_TLDS.map((t) => `c.email LIKE '%.${t}'`).join(" OR ");
const SEGMENTS: Record<string, string> = {
  // Safest send group: real, active, not blocklisted, and signed up in 2026 or used a product (quiz, Power Move…) or a SLEE form.
  tier_a: `SELECT email FROM contacts WHERE status='active' AND quality='ok'
             AND (COALESCE(json_extract(attrs,'$.brevo_created'), created_at) >= '2026-01-01'
                  OR cohort = 'brevo-product' OR json_extract(attrs,'$.sources') IS NOT NULL OR sah_score IS NOT NULL)
             AND email NOT LIKE 'test%' AND email NOT LIKE '%+%test%' AND email NOT LIKE 'muse%@lifelegallysingle.com'`,
  // Tier A, US only: known country = US, or unknown country with no non-US email domain (.uk, .de, .ca …).
  tier_a_us: `SELECT email FROM (${"__TIER_A__"}) t JOIN contacts c USING (email)
                WHERE c.country = 'US' OR (c.country IS NULL AND NOT (${NON_US_DOMAIN_SQL}))`,
  // Never send: bots, suspect addresses, Brevo-blocklisted, bounced, complained, unsubscribed.
  do_not_send: `SELECT email FROM contacts WHERE status <> 'active' OR quality <> 'ok' UNION SELECT email FROM suppressions`,
};

async function buildBrevoList(env: Env, segment: string, p: { name?: string; offset?: number }): Promise<string> {
  const sql = (SEGMENTS[segment] || "").replace("__TIER_A__", SEGMENTS.tier_a);
  if (!sql) throw new Error(`unknown segment ${segment}`);
  const name = p.name || `SLEE · ${segment}`;
  // find or create list in folder SLEE
  const folders = await brevo(env, "GET", "/contacts/folders?limit=50&offset=0");
  let folderId = (folders.data?.folders ?? []).find((f: any) => f.name === "SLEE")?.id;
  if (!folderId) { const f = await brevo(env, "POST", "/contacts/folders", { name: "SLEE" }); folderId = f.data?.id; }
  let listId: number | undefined;
  for (let off = 0; off < 300 && !listId; off += 50) {
    const l = await brevo(env, "GET", `/contacts/lists?limit=50&offset=${off}`);
    listId = (l.data?.lists ?? []).find((x: any) => x.name === name)?.id;
    if ((l.data?.lists ?? []).length < 50) break;
  }
  if (!listId) { const c = await brevo(env, "POST", "/contacts/lists", { name, folderId }); listId = c.data?.id; }
  if (!listId) throw new Error("could not create list");
  const isSend = segment !== "do_not_send";
  const finalSql = isSend ? `SELECT email FROM (${sql}) WHERE email NOT IN (${recentlyMailedSql()})` : sql;
  const { results } = await env.DB.prepare(finalSql).all<{ email: string }>();
  const emails = results.map((r) => r.email);
  let removed = 0;
  if (isSend) {
    // 12-hour rule: take recently mailed people OUT of this send list (they may have been added by an earlier build)
    const recent = (await env.DB.prepare(`SELECT email FROM (${sql}) WHERE email IN (${recentlyMailedSql()})`).all<{ email: string }>()).results.map((r) => r.email);
    for (let i = 0; i < recent.length; i += 150) {
      const r = await brevo(env, "POST", `/contacts/lists/${listId}/contacts/remove`, { emails: recent.slice(i, i + 150) });
      if (r.ok) removed += (r.data?.contacts?.success ?? []).length;
    }
  }
  let added = 0;
  for (let i = 0; i < emails.length; i += 150) {
    const r = await brevo(env, "POST", `/contacts/lists/${listId}/contacts/add`, { emails: emails.slice(i, i + 150) });
    if (r.ok) added += (r.data?.contacts?.success ?? []).length;
  }
  return `list ${listId} "${name}": ${emails.length} selected, ${added} added, ${removed} removed (mailed in last ${MARKETING_MIN_GAP_HOURS}h)`;
}

/* ---------------- Broadcasts (SLEE campaigns) ----------------
 * Queue: INSERT INTO slee_jobs (job, params) VALUES ('broadcast:<name>', '{"template":"…","emails":[…],"test_to":"you@…"}')
 *   test_to set + no "live":true  → ONE real preview email to test_to (personalized with the first recipient)
 *   "live":true                    → sends to every active, non-suppressed recipient once (deduped), 10 per tick
 */
async function runBroadcast(env: Env, name: string, p: { template: string; emails?: string[]; test_to?: string; live?: boolean }): Promise<string> {
  if (!TEMPLATES[p.template]) throw new Error(`unknown template ${p.template}`);
  const emails = (p.emails ?? []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
  if (!emails.length) throw new Error("no recipients");
  const J = JSON.stringify(emails);
  if (!p.live) {
    if (!p.test_to) throw new Error("preview needs test_to");
    const c = await env.DB.prepare("SELECT * FROM contacts WHERE email IN (SELECT value FROM json_each(?)) ORDER BY id LIMIT 1").bind(J).first<Contact>();
    if (!c) throw new Error("no recipient found in SLEE");
    const r = await sendPreview(env, c, p.template, p.test_to);
    return r.ok ? `preview sent to ${p.test_to} (personalized as ${c.email})` : `preview failed: ${r.error}`;
  }
  const seq = `broadcast:${name}`;
  const { results } = await env.DB.prepare(
    `SELECT c.* FROM contacts c WHERE c.email IN (SELECT value FROM json_each(?1)) AND c.status = 'active'
       AND c.email NOT IN (SELECT email FROM suppressions)
       AND NOT EXISTS (SELECT 1 FROM sends s WHERE s.contact_id = c.id AND s.sequence = ?2 AND s.status IN ('sent','dry_run'))
       AND c.email NOT IN (${recentlyMailedSql()})
     ORDER BY c.id LIMIT 6`
  ).bind(J, seq).all<Contact>();
  let sent = 0, failed = 0;
  for (const c of results) {
    const r = await sendTemplate(env, c, p.template, { sequence: seq, forceLive: true });
    r.ok ? sent++ : failed++;
  }
  const done = await env.DB.prepare(`SELECT COUNT(*) n FROM sends WHERE sequence = ? AND status = 'sent'`).bind(seq).first<{ n: number }>();
  return results.length === 6 ? `more: ${done?.n ?? 0} sent so far` : `done: ${done?.n ?? 0} sent total (${failed} failed this tick)`;
}

/** Emails that got a marketing email in the last MARKETING_MIN_GAP_HOURS (SLEE broadcasts + Brevo campaigns). */
export function recentlyMailedSql(): string {
  const cutoff = new Date(Date.now() - MARKETING_MIN_GAP_HOURS * 3600_000).toISOString();
  return `SELECT c2.email FROM sends s JOIN contacts c2 ON c2.id = s.contact_id
            WHERE s.status = 'sent' AND s.sequence LIKE 'broadcast:%' AND s.sent_at >= '${cutoff}'
          UNION SELECT email FROM email_events WHERE channel = 'marketing' AND type IN ('sent','delivered') AND created_at >= '${cutoff}'`;
}
