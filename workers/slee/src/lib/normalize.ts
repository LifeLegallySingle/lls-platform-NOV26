import type { SleeEvent } from "../env";
import { sha256Hex } from "./crypto";

/**
 * Accepts HUB's native lls_hub_eme_emit() payload OR the v1 contract and normalizes it.
 * Tolerant on purpose: key names are matched case-insensitively and common aliases are mapped,
 * so HUB/plugin payload changes don't break ingestion.
 */
const TYPE_ALIASES: Record<string, string> = {
  sah_quiz: "sah_quiz.completed",
  sah: "sah_quiz.completed",
  glotype: "glotype.completed",
  power_move_optin: "power_move.optin",
  power_move: "power_move.optin",
  ailife_coach: "ailife.subscribed",
  freedom_tax: "freedom_tax.calculated",
  datebase: "datebase.matched",
  optin: "optin.subscribed",
  lls_hub_optin: "optin.subscribed",
  identify: "identity.updated",
  google_login: "auth.google_login",
};

/** HUB native events use generic names (quiz_completed…) + properties.product — map by product. */
const PRODUCT_TYPES: Record<string, string> = {
  sah_quiz: "sah_quiz.completed",
  glotype: "glotype.completed",
  power_move_optin: "power_move.optin",
  power_move: "power_move.optin",
  ailife_coach: "ailife.subscribed",
  freedom_tax: "freedom_tax.calculated",
  freedom_tax_calculator: "freedom_tax.calculated",
  datebase: "datebase.matched",
  hub_optin: "optin.subscribed",
  lls_hub_optin: "optin.subscribed",
  google_auth: "auth.google_login",
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function pick(obj: any, ...keys: string[]): any {
  if (!obj || typeof obj !== "object") return undefined;
  const lower: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) lower[k.toLowerCase()] = v;
  for (const k of keys) if (lower[k] !== undefined && lower[k] !== null && lower[k] !== "") return lower[k];
  return undefined;
}

export async function normalize(raw: any, rawBody: string): Promise<SleeEvent | { error: string }> {
  if (!raw || typeof raw !== "object") return { error: "invalid_json" };
  const email = String(
    pick(raw, "email") ?? pick(pick(raw, "contact", "identity") ?? {}, "email") ?? ""
  ).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "invalid_email" };

  const rawType = String(pick(raw, "type", "event", "event_type", "source") ?? "identity.updated").toLowerCase();

  // HUB v5.8+ sends { event, properties:{…, product} }
  const attrsIn = pick(raw, "attrs", "attributes", "properties", "data", "payload") ?? {};
  const attrs: Record<string, unknown> = {};
  if (attrsIn && typeof attrsIn === "object") {
    for (const [k, v] of Object.entries(attrsIn)) attrs[k.toLowerCase()] = v;
  }
  // flat payloads: copy known top-level product keys too
  for (const k of ["sah_score", "sah_status", "sah_total", "sah_q15", "glotype_element", "glotype_score",
    "power_move", "next_power_move", "page_source", "pm_source", "firstname", "str_freedom_tax", "datebase_city"]) {
    const v = pick(raw, k);
    if (v !== undefined && attrs[k] === undefined) attrs[k] = v;
  }

  const product = String(attrs.product ?? pick(raw, "product") ?? "").toLowerCase();
  const type = TYPE_ALIASES[rawType] ?? PRODUCT_TYPES[product] ?? rawType;
  for (const k of ["product", "event_name", "source"]) delete attrs[k]; // routing metadata, not profile data
  // HUB bug workaround: page_source arrives as the opt-in slug ("blueprint"); keep it a URL when one exists.
  const ps = attrs.page_source;
  if (typeof ps === "string" && !/^https?:\/\//i.test(ps)) {
    if (!attrs.optin_source) attrs.optin_source = ps;
    const url = attrs.page_url ?? attrs.source_url;
    if (url) attrs.page_source = url; else delete attrs.page_source;
  }

  const hub = pick(raw, "hub_id", "identity_id", "uuid", "lls_id");
  // Prefer the full HUB identify URL (keeps its path, e.g. a REST endpoint); fall back to just the query string.
  const iq = pick(raw, "identify_url") ?? pick(raw, "identify_qs");
  return {
    v: 1,
    event_id: String(pick(raw, "event_id", "id") ?? (await sha256Hex(rawBody)).slice(0, 32)),
    type,
    occurred_at: String(pick(raw, "occurred_at", "timestamp", "created_at") ?? new Date().toISOString()),
    email,
    hub_id: hub !== undefined ? String(hub) : undefined,
    attrs,
    identify_qs: iq ? (/^https?:\/\//i.test(String(iq)) ? String(iq) : String(iq).replace(/^\?/, "")) : undefined,
    source: String(pick(raw, "source_system", "origin") ?? "hub"),
    product: product || undefined,
  };
}
