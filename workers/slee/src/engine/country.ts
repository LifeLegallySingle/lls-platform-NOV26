import type { Env } from "../env";
import { nowIso } from "../env";

/** Normalize a Cloudflare country code; ignore unknown (XX) and Tor (T1). */
export function cleanCountry(v: unknown): string | null {
  const c = String(v ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : null;
}

/** Record the most recent country we saw for this contact (signup or email click). */
export async function setCountry(env: Env, contactId: number, country: string | null, source: "signup" | "click") {
  if (!country) return;
  await env.DB.prepare(
    "UPDATE contacts SET country = ?, country_source = ?, country_at = ? WHERE id = ? AND (country IS NULL OR country <> ? OR country_source <> ?)"
  ).bind(country, source, nowIso(), contactId, country, source).run();
}
