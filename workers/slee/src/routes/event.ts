import type { Env } from "../env";
import { json } from "../lib/http";
import { verifySigned } from "../lib/crypto";
import { normalize } from "../lib/normalize";
import { inferSignals, maybeReactivate, upsertContact } from "../engine/contacts";
import { applySignals } from "../engine/enroll";
import { sendInstant } from "../engine/instant";
import { SEQ_BY_ID } from "../engine/sequences";
import { markBrevoSkipped, sourceForEvent, syncToBrevo } from "../engine/brevo-sync";

/** POST /v1/event — HUB -> SLEE. HMAC-signed, idempotent, accepts HUB's native payload. */
export async function handleEvent(req: Request, env: Env, ctx: ExecutionContext) {
  const body = await req.text();
  if (!(await verifySigned(env.HUB_SHARED_SECRET, req.headers.get("x-lls-timestamp"), body, req.headers.get("x-lls-signature")))) {
    return json({ ok: false, error: "bad_signature" }, 401);
  }
  let raw: unknown;
  try { raw = JSON.parse(body); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  // Batch support: HUB backfills can send { events: [...] }
  const list: unknown[] = Array.isArray((raw as any)?.events) ? (raw as any).events : [raw];
  // ~12 D1 queries per event; free plan allows 50 per invocation.
  if (list.length > 3) return json({ ok: false, error: "max_3_events_per_request" }, 413);

  const results = [];
  for (const item of list) results.push(await ingestOne(env, ctx, item, list.length > 1 ? JSON.stringify(item) : body));
  return json(list.length === 1 ? results[0] : { ok: true, results }, 202);
}

async function ingestOne(env: Env, ctx: ExecutionContext, raw: unknown, rawBody: string) {
  const ev = await normalize(raw, rawBody);
  if ("error" in ev) return { ok: false, error: ev.error };

  const dup = await env.DB.prepare("INSERT OR IGNORE INTO events (event_id, type, source, payload) VALUES (?,?,?,?)")
    .bind(ev.event_id, ev.type, ev.source, rawBody).run();
  if (!dup.meta.changes) return { ok: true, duplicate: true, event_id: ev.event_id };

  const brevoSource = sourceForEvent(ev);
  const { before, after } = await upsertContact(env, ev, { source: brevoSource });
  const signals = inferSignals(ev.type, before, after);
  if (brevoSource) signals.push(`source:${brevoSource}`);
  const contact = await maybeReactivate(env, after, signals);
  const { enrolled, exited } = await applySignals(env, contact, signals);

  await env.DB.prepare("UPDATE events SET contact_id = ?, signals = ? WHERE event_id = ?")
    .bind(contact.id, JSON.stringify(signals), ev.event_id).run();

  // SLEE → Brevo secondary copy (never blocks ingest; retries via outbox).
  for (const seqId of enrolled) {
    if (SEQ_BY_ID[seqId]?.steps[0]?.instant) ctx.waitUntil(sendInstant(env, contact.id, seqId));
  }
  if (brevoSource) ctx.waitUntil(syncToBrevo(env, contact, brevoSource));
  else ctx.waitUntil(markBrevoSkipped(env, contact, `no opt-in source (event ${ev.type}${ev.product ? ", product " + ev.product : ""})`));

  return { ok: true, event_id: ev.event_id, contact_id: contact.id, status: contact.status, signals, enrolled, exited, brevo_source: brevoSource };
}
