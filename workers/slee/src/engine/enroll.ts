import type { Contact, Env } from "../env";
import { addHours, nowIso } from "../env";
import { SEQUENCES, SEQ_BY_ID } from "./sequences";

export async function applySignals(env: Env, c: Contact, signals: string[]) {
  const now = nowIso();
  const enrolled: string[] = [];
  const exited: string[] = [];

  for (const seq of SEQUENCES) {
    const hit = seq.exitOn?.find((x) => signals.includes(x));
    if (!hit) continue;
    const r = await env.DB.prepare(
      "UPDATE enrollments SET status='exited', exit_reason=?, updated_at=? WHERE contact_id=? AND sequence=? AND status='active'"
    ).bind(hit, now, c.id, seq.id).run();
    if (r.meta.changes) exited.push(seq.id);
  }

  if (c.status !== "active") return { enrolled, exited };

  for (const seq of SEQUENCES) {
    if (!seq.triggers.some((t) => signals.includes(t))) continue;
    if (seq.eligible && !seq.eligible(c)) continue;
    if (await enroll(env, c.id, seq.id, addHours(now, seq.steps[0]?.delayHours ?? 0))) enrolled.push(seq.id);
  }
  return { enrolled, exited };
}

/** Idempotent: a contact is in each sequence at most once (UNIQUE(contact_id, sequence)). */
export async function enroll(env: Env, contactId: number, sequence: string, startAt: string): Promise<boolean> {
  if (!SEQ_BY_ID[sequence]) throw new Error(`unknown sequence ${sequence}`);
  const r = await env.DB.prepare(
    "INSERT OR IGNORE INTO enrollments (contact_id, sequence, step, next_at) VALUES (?,?,0,?)"
  ).bind(contactId, sequence, startAt).run();
  return !!r.meta.changes;
}

export async function exitAll(env: Env, contactId: number, reason: string) {
  await env.DB.prepare(
    "UPDATE enrollments SET status='exited', exit_reason=?, updated_at=? WHERE contact_id=? AND status='active'"
  ).bind(reason, nowIso(), contactId).run();
}
