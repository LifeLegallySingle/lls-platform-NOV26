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
};

export const BRAND = {
  name: "Life Legally Single™",
  accent: "#B8860B",   // TODO: swap for official brand accent
  ink: "#141414",
  muted: "#6B6B6B",
  bg: "#F7F5F0",
  card: "#FFFFFF",
  signoff: "— Jen, Life Legally Single™",
};
