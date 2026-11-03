import type { Env } from "../env";
import { nowIso } from "../env";
import { ciaTier, sahTier, toNum, toStr } from "./derive";

/**
 * Set-based writes via json_each(): one bound JSON param, one statement, hundreds of rows.
 * Keeps every admin call far under D1 free-plan limits (50 queries / invocation, 100 bound params / query).
 */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface ImportRow { email: string; firstname?: string; cohort?: string; quality?: string; attrs?: Record<string, unknown> }

export async function bulkImport(env: Env, list: ImportRow[], enrollSeq?: string, startAt?: string) {
  let invalid = 0;
  const rows = [];
  for (const it of list) {
    const email = String(it.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { invalid++; continue; }
    const attrs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(it.attrs || {})) if (v !== null && v !== "") attrs[k.toLowerCase()] = v;
    if (it.firstname) attrs.firstname = it.firstname;
    const sah_score = toNum(attrs.sah_score);
    const glotype = toStr(attrs.glotype_element);
    const power_move = toStr(attrs.power_move);
    rows.push({
      email, cohort: it.cohort ?? "legacy",
      quality: ["bot", "suspect"].includes(String(it.quality)) ? String(it.quality) : "ok",
      firstname: toStr(attrs.firstname), attrs: JSON.stringify(attrs),
      sah_score, sah_tier: sahTier(sah_score, attrs.sah_status), glotype, power_move,
      cia_tier: ciaTier({ sah_score, glotype, power_move, clicks: 0 }, attrs),
    });
  }
  if (!rows.length) return { upserted: 0, suppressed: 0, enrolled: 0, invalid };
  const J = JSON.stringify(rows);
  const now = nowIso();
  const v = (k: string) => `json_extract(j.value,'$.${k}')`;

  const stmts = [
    env.DB.prepare(
      `INSERT INTO suppressions (email, reason, source, created_at)
       SELECT ${v("email")}, ${v("quality")}, 'import', ?2 FROM json_each(?1) j WHERE ${v("quality")} <> 'ok'
       ON CONFLICT(email) DO NOTHING`
    ).bind(J, now),
    env.DB.prepare(
      `INSERT INTO contacts (email, firstname, attrs, sah_score, sah_tier, glotype, power_move, cia_tier, cohort, quality, status, created_at, updated_at)
       SELECT ${v("email")}, ${v("firstname")}, ${v("attrs")}, ${v("sah_score")}, ${v("sah_tier")}, ${v("glotype")}, ${v("power_move")},
              ${v("cia_tier")}, ${v("cohort")}, ${v("quality")},
              CASE WHEN EXISTS (SELECT 1 FROM suppressions s WHERE s.email = ${v("email")}) THEN 'suppressed' ELSE 'active' END, ?2, ?2
         FROM json_each(?1) j WHERE true
       ON CONFLICT(email) DO UPDATE SET cohort = COALESCE(contacts.cohort, excluded.cohort), updated_at = excluded.updated_at`
    ).bind(J, now),
  ];
  if (enrollSeq) {
    stmts.push(env.DB.prepare(
      `INSERT OR IGNORE INTO enrollments (contact_id, sequence, step, next_at, created_at, updated_at)
       SELECT c.id, ?2, 0, ?3, ?4, ?4 FROM contacts c JOIN json_each(?1) j ON c.email = ${v("email")}
        WHERE c.status = 'active'`
    ).bind(J, enrollSeq, startAt ?? now, now));
  }
  const res = await env.DB.batch(stmts);
  return { upserted: res[1].meta.changes, suppressed: res[0].meta.changes, enrolled: enrollSeq ? res[2].meta.changes : 0, invalid };
}

export async function bulkEnroll(env: Env, emails: string[], seq: string, startAt: string) {
  const J = JSON.stringify(emails.map((e) => String(e).trim().toLowerCase()));
  const now = nowIso();
  const r = await env.DB.prepare(
    `INSERT OR IGNORE INTO enrollments (contact_id, sequence, step, next_at, created_at, updated_at)
     SELECT c.id, ?2, 0, ?3, ?4, ?4 FROM contacts c JOIN json_each(?1) j ON c.email = j.value WHERE c.status = 'active'`
  ).bind(J, seq, startAt, now).run();
  return { enrolled: r.meta.changes, not_enrolled: emails.length - r.meta.changes };
}

export async function bulkSuppress(env: Env, emails: string[], reason: string) {
  const J = JSON.stringify(emails.map((e) => String(e).trim().toLowerCase()));
  const now = nowIso();
  const status = ["unsubscribed", "bounced", "complained"].includes(reason) ? reason : "suppressed";
  const res = await env.DB.batch([
    env.DB.prepare(`INSERT OR REPLACE INTO suppressions (email, reason, source, created_at) SELECT j.value, ?2, 'admin', ?3 FROM json_each(?1) j`).bind(J, reason, now),
    env.DB.prepare(`UPDATE contacts SET status = ?2, updated_at = ?3 WHERE email IN (SELECT value FROM json_each(?1))`).bind(J, status, now),
    env.DB.prepare(`UPDATE enrollments SET status = 'exited', exit_reason = ?2, updated_at = ?3
                    WHERE status = 'active' AND contact_id IN (SELECT id FROM contacts WHERE email IN (SELECT value FROM json_each(?1)))`).bind(J, reason, now),
  ]);
  return { suppressed: res[0].meta.changes, enrollments_exited: res[2].meta.changes };
}
