import type { Env } from "../env";
import { json } from "../lib/http";

/**
 * GET /v1/admin/deliverability?days=7&source=all|slee|plugins|campaigns
 * Funnel + per-domain deliverability from Brevo webhook events.
 */
export async function handleDeliverability(env: Env, url: URL) {
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 7), 1), 180);
  const source = url.searchParams.get("source") || "all";
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const srcSql =
    source === "slee" ? "AND channel = 'transactional' AND tag LIKE '%slee%'" :
    source === "plugins" ? "AND channel = 'transactional' AND (tag IS NULL OR tag NOT LIKE '%slee%')" :
    source === "campaigns" ? "AND channel = 'marketing'" : "";

  const cols = `
    SUM(type='sent') sent, SUM(type='delivered') delivered, SUM(type='deferred') deferred,
    SUM(type='soft_bounce') soft_bounce, SUM(type='hard_bounce') hard_bounce, SUM(type='invalid_email') invalid,
    SUM(type='blocked') blocked, SUM(type='spam') spam, SUM(type='unsubscribed') unsubscribed,
    SUM(type='error') error, SUM(type IN ('unique_opened','opened')) unique_opened, SUM(type='clicked') clicked`;

  const [totals, domains] = await Promise.all([
    env.DB.prepare(`SELECT ${cols} FROM email_events WHERE created_at >= ? ${srcSql}`).bind(since).first<Record<string, number>>(),
    env.DB.prepare(`SELECT domain, ${cols} FROM email_events WHERE created_at >= ? ${srcSql} GROUP BY domain ORDER BY SUM(type='sent') DESC LIMIT 15`).bind(since).all<Record<string, any>>(),
  ]);

  const rate = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const withRates = (r: Record<string, any>) => ({
    ...r,
    delivery_rate_pct: rate(r.delivered ?? 0, r.sent ?? 0),
    bounce_rate_pct: rate((r.hard_bounce ?? 0) + (r.soft_bounce ?? 0) + (r.invalid ?? 0) + (r.blocked ?? 0), r.sent ?? 0),
    complaint_rate_pct: rate(r.spam ?? 0, r.delivered ?? 0),
    deferral_rate_pct: rate(r.deferred ?? 0, r.sent ?? 0),
    unique_open_rate_pct_unreliable: rate(r.unique_opened ?? 0, r.delivered ?? 0),
    click_rate_pct: rate(r.clicked ?? 0, r.delivered ?? 0),
  });

  return json({
    window_days: days, source,
    guardrails: { complaint_rate_pct_max: 0.1, hard_bounce_rate_pct_max: 2 },
    totals: totals ? withRates(totals) : null,
    by_domain: domains.results.map(withRates),
  });
}

/** GET /v1/admin/campaigns?days=30 — one row per Brevo campaign (marketing webhook). */
export async function handleCampaigns(env: Env, url: URL) {
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 30), 1), 180);
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT campaign, MAX(campaign_name) name, MIN(created_at) first_event,
       COUNT(DISTINCT CASE WHEN type='delivered' THEN email END) delivered,
       COUNT(DISTINCT CASE WHEN type IN ('opened','unique_opened') THEN email END) opened,
       COUNT(DISTINCT CASE WHEN type='clicked' THEN email END) clicked,
       COUNT(DISTINCT CASE WHEN type IN ('hard_bounce','soft_bounce','invalid_email','blocked') THEN email END) bounced,
       COUNT(DISTINCT CASE WHEN type='unsubscribed' THEN email END) unsubscribed,
       COUNT(DISTINCT CASE WHEN type='spam' THEN email END) spam
     FROM email_events WHERE channel='marketing' AND campaign IS NOT NULL AND created_at >= ?
     GROUP BY campaign ORDER BY first_event DESC LIMIT 50`
  ).bind(since).all<Record<string, any>>();
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  return json({ window_days: days, campaigns: results.map((r) => ({
    ...r,
    open_rate_pct_unreliable: pct(r.opened, r.delivered), click_rate_pct: pct(r.clicked, r.delivered),
    unsub_rate_pct: pct(r.unsubscribed, r.delivered), complaint_rate_pct: pct(r.spam, r.delivered),
  })) });
}

/**
 * GET /v1/admin/emails?days=30 — one row per SLEE email template:
 * sent (SLEE log) → delivered / opened (Brevo, joined on message id) → clicked (SLEE's own tracked links).
 */
export async function handleEmailReport(env: Env, url: URL) {
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 30), 1), 180);
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT s.sequence, s.template,
       COUNT(DISTINCT s.id) sent,
       COUNT(DISTINCT CASE WHEN e.type='delivered' THEN s.id END) delivered,
       COUNT(DISTINCT CASE WHEN e.type IN ('unique_opened','opened','first_opening') THEN s.id END) opened,
       COUNT(DISTINCT k.send_id) clicked,
       COUNT(DISTINCT CASE WHEN e.type IN ('hard_bounce','soft_bounce','invalid_email','blocked') THEN s.id END) bounced,
       COUNT(DISTINCT CASE WHEN e.type='unsubscribed' THEN s.id END) unsubscribed_brevo
     FROM sends s
     LEFT JOIN email_events e ON e.message_id = s.provider_id AND s.provider_id IS NOT NULL
     LEFT JOIN clicks k ON k.send_id = s.id
     WHERE s.sent_at >= ? AND s.status = 'sent'
     GROUP BY s.sequence, s.template ORDER BY s.sequence, s.template`
  ).bind(since).all<Record<string, any>>();
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const dry = await env.DB.prepare("SELECT COUNT(*) n FROM sends WHERE status='dry_run' AND sent_at >= ?").bind(since).first<{ n: number }>();
  return json({ window_days: days, dry_run_renders: dry?.n ?? 0, emails: results.map((r) => ({
    ...r, delivery_rate_pct: pct(r.delivered, r.sent), open_rate_pct_unreliable: pct(r.opened, r.delivered), click_rate_pct: pct(r.clicked, r.delivered),
  })) });
}
