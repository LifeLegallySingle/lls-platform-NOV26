import type { Env } from "../env";
import { nowIso } from "../env";
import { brevoApi } from "../lib/brevo";

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
    } else { status = "error"; result = "unknown job"; }
  } catch (e) { status = "error"; result = String(e).slice(0, 300); }
  await env.DB.prepare("UPDATE slee_jobs SET status = ?, result = ?, done_at = ? WHERE job = ?").bind(status, result, nowIso(), job.job).run();
  return { job: job.job, status, result };
}
