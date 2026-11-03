import type { Contact, Env } from "../env";
import { isDry, nowIso } from "../env";
import { html, json } from "../lib/http";
import { getByEmail } from "../engine/contacts";
import { bulkEnroll, bulkImport, bulkSuppress } from "../engine/bulk";
import { render, sendTemplate } from "../engine/send";
import { runScheduler, sentToday } from "../engine/scheduler";
import { SEQUENCES, SEQ_BY_ID } from "../engine/sequences";
import { TEMPLATES } from "../templates";

export async function handleAdmin(req: Request, env: Env, ctx: ExecutionContext, path: string) {
  const url = new URL(req.url);
  const body: any = req.method === "POST" ? await req.json().catch(() => ({})) : {};

  switch (`${req.method} ${path}`) {
    case "GET /v1/admin/stats": {
      const q = (sql: string) => env.DB.prepare(sql).all().then((r) => r.results);
      return json({
        dry_run: isDry(env),
        sent_today: await sentToday(env),
        daily_cap: Number(env.DAILY_SEND_CAP),
        contacts_by_status: await q("SELECT status, COUNT(*) n FROM contacts GROUP BY status"),
        contacts_by_cohort: await q("SELECT COALESCE(cohort,'(hub)') cohort, status, COUNT(*) n FROM contacts GROUP BY 1,2 ORDER BY 1"),
        contacts_by_sah_tier: await q("SELECT sah_tier, COUNT(*) n FROM contacts WHERE sah_tier IS NOT NULL GROUP BY 1"),
        contacts_by_cia: await q("SELECT cia_tier, COUNT(*) n FROM contacts GROUP BY 1"),
        enrollments: await q("SELECT sequence, status, COUNT(*) n FROM enrollments GROUP BY 1,2 ORDER BY 1"),
        sends_by_template_7d: await q(`SELECT template, status, COUNT(*) n FROM sends WHERE sent_at >= '${new Date(Date.now() - 7 * 864e5).toISOString()}' GROUP BY 1,2`),
        clicks_by_template_7d: await q(`SELECT s.template, COUNT(DISTINCT k.contact_id) clickers FROM clicks k JOIN sends s ON s.id = k.send_id WHERE k.clicked_at >= '${new Date(Date.now() - 7 * 864e5).toISOString()}' GROUP BY 1`),
        suppressions: await q("SELECT reason, COUNT(*) n FROM suppressions GROUP BY 1"),
        feedback_outbox_pending: (await env.DB.prepare("SELECT COUNT(*) n FROM feedback_outbox").first<{ n: number }>())?.n ?? 0,
      });
    }

    case "GET /v1/admin/contact": {
      const c = await getByEmail(env, url.searchParams.get("email") || "");
      if (!c) return json({ ok: false, error: "not_found" }, 404);
      const [enr, sends, events] = await Promise.all([
        env.DB.prepare("SELECT * FROM enrollments WHERE contact_id = ?").bind(c.id).all(),
        env.DB.prepare("SELECT id, sequence, template, status, sent_at FROM sends WHERE contact_id = ? ORDER BY sent_at DESC LIMIT 20").bind(c.id).all(),
        env.DB.prepare("SELECT event_id, type, signals, received_at FROM events WHERE contact_id = ? ORDER BY received_at DESC LIMIT 20").bind(c.id).all(),
      ]);
      return json({ contact: { ...c, attrs: JSON.parse(c.attrs) }, enrollments: enr.results, sends: sends.results, events: events.results });
    }

    case "GET /v1/admin/sequences":
      return json(SEQUENCES.map((s) => ({ id: s.id, description: s.description, triggers: s.triggers, exitOn: s.exitOn ?? [],
        steps: s.steps.map((st) => ({ delayHours: st.delayHours, template: st.template, action: st.action, conditional: !!st.when })) })));

    /**
     * Legacy import (pre-HUB Brevo contacts). Max 400 per request — 3 SQL statements total (free-plan safe).
     * { contacts:[{email, firstname?, cohort?, quality?, attrs?}], enroll?: "reengage", start_at?: ISO }
     * quality "bot"/"suspect" → stored but suppressed (never mailed unless they later take a quiz/opt in).
     * Existing contacts keep their HUB data; only a missing cohort is filled in.
     */
    case "POST /v1/admin/import": {
      const list: any[] = Array.isArray(body.contacts) ? body.contacts : [];
      if (!list.length || list.length > 400) return json({ ok: false, error: "send 1–400 contacts" }, 400);
      if (body.enroll && !SEQ_BY_ID[body.enroll]) return json({ ok: false, error: "unknown sequence" }, 400);
      const startAt = body.start_at ? new Date(body.start_at).toISOString() : nowIso();
      return json({ ok: true, ...(await bulkImport(env, list, body.enroll, startAt)) });
    }

    case "POST /v1/admin/enroll": {
      if (!SEQ_BY_ID[body.sequence]) return json({ ok: false, error: "unknown sequence" }, 400);
      const emails: string[] = (body.emails || []).slice(0, 1000);
      return json({ ok: true, ...(await bulkEnroll(env, emails, body.sequence, body.start_at ? new Date(body.start_at).toISOString() : nowIso())) });
    }

    case "POST /v1/admin/suppress": {
      const emails: string[] = (body.emails || []).slice(0, 1000);
      return json({ ok: true, ...(await bulkSuppress(env, emails, body.reason || "manual")) });
    }

    /** Render any template for QA: { template, email? , contact?: {...overrides} }. Returns HTML. */
    case "POST /v1/admin/preview": {
      if (!TEMPLATES[body.template]) return json({ ok: false, error: "unknown template", templates: Object.keys(TEMPLATES) }, 400);
      const real = body.email ? await getByEmail(env, body.email) : null;
      const c: Contact = real ?? {
        id: 0, email: "preview@example.com", hub_id: null, firstname: "Ana", attrs: "{}", sah_score: 13, sah_tier: "TRUE",
        glotype: null, power_move: "Wallet", cia_tier: "WARM", cohort: null, quality: "ok", identify_qs: null, status: "active",
        clicks: 0, last_click_at: null, last_sent_at: null, created_at: nowIso(), updated_at: nowIso(), ...(body.contact || {}),
      };
      const r = await render(env, c, body.template, "preview");
      return url.searchParams.get("format") === "json" ? json({ subject: r.subject, text: r.text }) : html(r.html);
    }

    /** Send one template to one address now (respects DRY_RUN). Use for seed/inbox tests. */
    case "POST /v1/admin/test-send": {
      const c = await getByEmail(env, body.email || "");
      if (!c) return json({ ok: false, error: "contact not found — send a test event first" }, 404);
      return json(await sendTemplate(env, c, body.template, { sequence: "test" }));
    }

    case "POST /v1/admin/run-scheduler":
      return json(await runScheduler(env));
  }
  return json({ ok: false, error: "not_found" }, 404);
}
