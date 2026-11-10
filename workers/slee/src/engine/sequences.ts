import type { Contact } from "../env";

export interface Step {
  delayHours: number;                 // relative to the previous step (or enrollment for step 0)
  template?: string;                  // template id in templates/index.ts
  action?: "sunset";                  // non-email step
  when?: (c: Contact) => boolean;     // skip step (no send) when false
  instant?: boolean;                  // send the moment they sign up (confirmation emails); ignores the daily-gap rule
}
export interface Sequence {
  id: string;
  description: string;
  triggers: string[];                 // signals that enroll
  exitOn?: string[];                  // signals that stop it
  eligible?: (c: Contact) => boolean;
  steps: Step[];
}

/**
 * Journeys as code. Order of steps = order of sends. Global frequency cap applies across all sequences.
 * NOTE: product plugins (SAH, Power Move) already send their instant result emails — SLEE starts after.
 */
export const SEQUENCES: Sequence[] = [
  {
    id: "sah_nurture",
    description: "SAH quiz takers — tier-personalized nurture (TRUE / MOSTLY / SOME / NOT)",
    triggers: ["sah_quiz.completed"],
    exitOn: ["ailife.subscribed"],
    steps: [
      { delayHours: 24, template: "sah_nurture_1" },
      { delayHours: 72, template: "sah_nurture_2" },
      { delayHours: 96, template: "sah_nurture_3" },
      { delayHours: 144, template: "sah_nurture_4" },
    ],
  },
  {
    id: "power_move_activation",
    description: "Power Move opt-ins — activate their pillar, then bridge into SAH",
    triggers: ["power_move.optin"],
    steps: [
      { delayHours: 2, template: "pm_1" },
      { delayHours: 72, template: "pm_2" },
    ],
  },
  {
    id: "glotype_followup",
    description: "GloType completers — element deep-dive + next door",
    triggers: ["glotype.completed"],
    steps: [{ delayHours: 24, template: "glo_1" }],
  },
  {
    id: "freedom_tax_nurture",
    description: "Freedom Tax™ Calculator users — UnWedded Wallet™ nurture",
    triggers: ["freedom_tax.calculated"],
    steps: [
      { delayHours: 24, template: "ft_1" },
      { delayHours: 96, template: "ft_2" },
    ],
  },
  {
    id: "welcome",
    description: "Plain opt-ins ([lls_hub_optin], homepage) — pick-your-door welcome",
    triggers: ["optin.subscribed"],
    exitOn: ["sah_quiz.completed"],
    // plain opt-ins only; product journeys and forms with their own confirmation cover the rest
    eligible: (c) => c.sah_score == null && !c.power_move && !c.glotype && !hasOwnConfirmation(c),
    steps: [
      { delayHours: 0, template: "welcome_1" },
      { delayHours: 72, template: "welcome_2" },
    ],
  },
  {
    id: "memes_confirm",
    description: "Single Memes signup (/single-memes/, /valentines-day-memes/) — instant delivery email",
    triggers: ["source:memes"],
    steps: [{ delayHours: 0, template: "memes_1", instant: true }],
  },
  {
    id: "reengage",
    description: "Legacy (pre-HUB) contacts — 3-touch win-back, then sunset non-clickers",
    triggers: ["reengage.start"],     // enrolled by /v1/admin/import or /v1/admin/enroll
    exitOn: ["email.clicked", "sah_quiz.completed", "optin.subscribed"],
    steps: [
      { delayHours: 0, template: "re_1" },
      { delayHours: 168, template: "re_2" },
      { delayHours: 168, template: "re_3" },
      { delayHours: 168, action: "sunset" },
    ],
  },
];

/** Form sources that have their own instant confirmation journey (they skip the generic welcome). */
export const CONFIRM_SOURCES = new Set(["memes"]);
function hasOwnConfirmation(c: Contact): boolean {
  try { const a = JSON.parse(c.attrs || "{}"); return CONFIRM_SOURCES.has(String(a.optin_source ?? "")); } catch { return false; }
}

export const SEQ_BY_ID: Record<string, Sequence> = Object.fromEntries(SEQUENCES.map((s) => [s.id, s]));
