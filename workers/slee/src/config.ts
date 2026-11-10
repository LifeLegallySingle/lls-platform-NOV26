/**
 * Brand-level knobs. Edit here, push, auto-deploy.
 * Paths are relative to SITE_URL. Placeholders marked TODO need real URLs.
 */
export const LINKS = {
  sahQuiz: "/single-at-heart-by-bella-depaulo/",
  glotype: "/glotype",
  powerMove: "/#lls-power-move",
  freedomTax: "/freedom-tax-calculator/",
  unweddedWallet: "/unweddedwallet/",
  selfPartnered: "/self-partnered-system/",
  datebase: "/datebase/",
  soloTravel: "/solo-travel/",
  community: "/community/",
  dashboard: "/soloachievers/",
};

/** Deliverability rules (soft bounces counted within a rolling window). */
export const DELIVERABILITY = {
  softBounceWindowDays: 30,
  unreliableAt: 2,   // flag as "unreliable" (still mailed)
  suppressAt: 3,     // suppress (lifts automatically on click / quiz / opt-in)
  /** Analytics events (sent/delivered/opens/clicks/deferred/errors) stop being stored past this per UTC day.
   *  Bounces, complaints and unsubscribes are ALWAYS processed. Free D1 = 100k row-writes/day. */
  maxAnalyticsEventsPerDay: 20000,
  eventRetentionDays: 180,
};

/**
 * Brevo is a secondary copy fed ONLY by SLEE. One Brevo list per entry source.
 * Lists are auto-created in a "SLEE" folder (names below) on the first cron run; IDs land in D1 table brevo_lists.
 * To reuse existing Brevo lists instead, set var BREVO_LIST_MAP = '{"sah_quiz":12, ...}' in wrangler.toml.
 */
export const BREVO_SYNC = {
  folderName: "SLEE",
  listName: (source: string) => `SLEE · ${source}`,
  /** Sources SLEE auto-provisions lists for. ANY form source is accepted; others need a list in BREVO_LIST_MAP. */
  knownSources: [
    "blueprint", "site_optin", "self_love_glow", "power_move_optin", "sah_quiz", "glotype", "freedom_tax",
    // Brevo-form replacements (approved Nov 10, 2026)
    "dating_coach_waitlist", "datebase_waitlist", "solo_dating_waitlist", "alissha_waitlist_solo_travel",
    "solo_travel_deals", "memes", "unweddedwallet", "post_10_reasons_stay_single",
  ],
};

export const BRAND = {
  name: "Life Legally Single™",
  accent: "#6427b0",   // LLS brand purple
  ink: "#141414",
  muted: "#6B6B6B",
  bg: "#F7F5F0",
  card: "#FFFFFF",
  signoff: "— Jen, Life Legally Single™",
};
