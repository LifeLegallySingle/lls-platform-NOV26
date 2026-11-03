import type { Env } from "../env";
import { b64urlEncode, hmacHex } from "../lib/crypto";

const base = (env: Env) => env.PUBLIC_BASE_URL.replace(/\/$/, "");

export function absolute(env: Env, path: string) {
  return /^https?:\/\//i.test(path) ? path : env.SITE_URL.replace(/\/$/, "") + (path.startsWith("/") ? path : "/" + path);
}

export async function clickUrl(env: Env, sendId: string, dest: string) {
  const sig = (await hmacHex(env.LINK_SECRET, `c|${sendId}|${dest}`)).slice(0, 24);
  return `${base(env)}/c/${sendId}/${b64urlEncode(dest)}/${sig}`;
}

export async function unsubUrl(env: Env, contactId: number) {
  const sig = (await hmacHex(env.LINK_SECRET, `u|${contactId}`)).slice(0, 24);
  return `${base(env)}/u/${contactId}/${sig}`;
}
