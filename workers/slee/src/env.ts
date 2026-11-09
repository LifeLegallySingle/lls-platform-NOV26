export interface Env {
  DB: D1Database;
  // secrets
  HUB_SHARED_SECRET: string;
  LINK_SECRET: string;
  ADMIN_TOKEN: string;
  BREVO_API_KEY: string;
  BREVO_WEBHOOK_TOKEN: string;
  // vars
  SITE_URL: string;
  PUBLIC_BASE_URL: string;
  HUB_FEEDBACK_URL: string;
  IDENTIFY_DOMAINS: string;
  SENDER_EMAIL: string;
  SENDER_NAME: string;
  REPLY_TO?: string;
  MAIL_ADDRESS: string;
  DAILY_SEND_CAP: string;
  BATCH_SIZE: string;
  MIN_HOURS_BETWEEN_EMAILS: string;
  DRY_RUN: string;
  BREVO_LIST_MAP?: string;   // optional JSON override {source: listId}
  BREVO_API_BASE?: string;   // tests only
}

export interface Contact {
  id: number;
  email: string;
  hub_id: string | null;
  firstname: string | null;
  attrs: string;
  sah_score: number | null;
  sah_tier: string | null;
  glotype: string | null;
  power_move: string | null;
  cia_tier: string;
  cohort: string | null;
  quality: string;
  identify_qs: string | null;
  status: string;
  clicks: number;
  last_click_at: string | null;
  last_sent_at: string | null;
  soft_bounces: number;
  last_soft_bounce_at: string | null;
  deliverability: string;
  brevo_synced_at: string | null;
  brevo_error: string | null;
  created_at: string;
  updated_at: string;
}

/** Normalized SLEE event (contract: packages/event-schema/event.v1.schema.json) */
export interface SleeEvent {
  v: 1;
  event_id: string;
  type: string;
  occurred_at: string;
  email: string;
  hub_id?: string;
  attrs: Record<string, unknown>;
  identify_qs?: string;
  source: string;
  product?: string;          // HUB product slug (sah_quiz, hub_optin, glotype…)
}

export const nowIso = () => new Date().toISOString();
export const addHours = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * 3600_000).toISOString();
export const isDry = (env: Env) => String(env.DRY_RUN).toLowerCase() !== "false";
