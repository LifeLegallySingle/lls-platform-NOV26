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

export const BRAND = {
  name: "Life Legally Single™",
  accent: "#6427b0",   // LLS brand purple
  ink: "#141414",
  muted: "#6B6B6B",
  bg: "#F7F5F0",
  card: "#FFFFFF",
  signoff: "— Jen, Life Legally Single™",
};
