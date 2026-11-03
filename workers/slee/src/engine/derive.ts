import type { Contact } from "../env";

/** SAH tier from the quiz's own status text (authoritative), falling back to score bands. */
export function sahTier(score: number | null, status: unknown): string | null {
  const s = String(status ?? "").toLowerCase();
  if (s.includes("congratulations")) return "TRUE";
  if (s.includes("more than a few ways")) return "MOSTLY";
  if (s.includes("a few ways")) return "SOME";
  if (s.includes("not single at heart")) return "NOT";
  if (score == null || Number.isNaN(score)) return null;
  // Fallback bands — tune to the SAH quiz's official scoring if it changes.
  return score >= 13 ? "TRUE" : score >= 10 ? "MOSTLY" : score >= 7 ? "SOME" : "NOT";
}

/**
 * CIA tier (COLD/WARM/HOT/CHAMPION). Simplified placeholder —
 * replace the body with the full CIA spec from the EME specification when ready.
 */
export function ciaTier(c: Pick<Contact, "sah_score" | "glotype" | "power_move" | "clicks">, attrs: Record<string, unknown>): string {
  const products = [c.sah_score != null, !!c.glotype, !!c.power_move, attrs.str_freedom_tax != null, attrs.datebase_city != null]
    .filter(Boolean).length;
  if (attrs.ailife_status === "active" || attrs.ailife_coach || c.clicks >= 6) return "CHAMPION";
  if ((c.sah_score ?? 0) >= 10 && products >= 2) return "HOT";
  if (c.clicks >= 3) return "HOT";
  if (products >= 1 || c.clicks >= 1) return "WARM";
  return "COLD";
}

export const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const toStr = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
export const parseAttrs = (c: Contact | null): Record<string, unknown> => {
  if (!c) return {};
  try { return JSON.parse(c.attrs || "{}"); } catch { return {}; }
};
