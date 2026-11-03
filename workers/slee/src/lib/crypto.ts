const enc = new TextEncoder();

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function hmacHex(secret: string, msg: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(msg: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(msg));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function b64urlEncode(s: string): string {
  let bin = "";
  enc.encode(s).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): string {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  const bin = atob(t);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** HUB <-> SLEE signature: sha256=HMAC(secret, `${timestamp}.${rawBody}`), 5-minute replay window. */
export async function verifySigned(secret: string, ts: string | null, body: string, sig: string | null, skew = 300) {
  if (!secret || !ts || !sig) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > skew) return false;
  return safeEqual("sha256=" + (await hmacHex(secret, `${ts}.${body}`)), sig);
}

export async function signedHeaders(secret: string, body: string): Promise<Record<string, string>> {
  const ts = String(Math.floor(Date.now() / 1000));
  return { "X-LLS-Timestamp": ts, "X-LLS-Signature": "sha256=" + (await hmacHex(secret, `${ts}.${body}`)) };
}
