import type { Env } from "../env";
import { json } from "../lib/http";

/**
 * GET /v1/admin/deliverability?days=7&source=all|slee|plugins
 * Funnel + per-domain deliverability from Brevo webhook events.
 */
export async function handleDeliverability(env: Env, url: URL) {
  const days = Math.min(Math.max(Number(url.searchParams.get("days") || 7), 1), 180);
  const source = url.searchParams.get("source") || "all";
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const srcSql = source === "slee" ? "AND tag LIKE '%slee%'" : source === "plugins" ? "AND (tag IS NULL OR tag NOT LIKE '%slee%')" : "";

  const cols = `
    SUM(type='sent') sent, SUM(type='delivered') delivered, SUM(type='deferred') deferred,
    SUM(type='soft_bounce') soft_bounce, SUM(type='hard_bounce') hard_bounce, SUM(type='invalid_email') invalid,
    SUM(type='blocked') blocked, SUM(type='spam') spam, SUM(type='unsubscribed') unsubscribed,
    SUM(type='error') error, SUM(type='unique_opened') unique_opened, SUM(type='clicked') clicked`;

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
