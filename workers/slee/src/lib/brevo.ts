import type { Env } from "../env";

const API = "https://api.brevo.com/v3";

export async function brevoSend(env: Env, msg: {
  to: string; toName?: string; subject: string; html: string; text: string;
  unsubUrl: string; sendId: string; tags: string[];
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const body = {
    sender: { email: env.SENDER_EMAIL, name: env.SENDER_NAME },
    to: [{ email: msg.to, ...(msg.toName ? { name: msg.toName } : {}) }],
    ...(env.REPLY_TO ? { replyTo: { email: env.REPLY_TO } } : {}),
    subject: msg.subject,
    htmlContent: msg.html,
    textContent: msg.text,
    headers: {
      "List-Unsubscribe": `<${msg.unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-SLEE-Send": msg.sendId,
    },
    tags: ["slee", ...msg.tags],
  };
  try {
    const r = await fetch(`${API}/smtp/email`, {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const t = await r.text();
    if (!r.ok) return { ok: false, error: `brevo ${r.status}: ${t.slice(0, 300)}` };
    const j = JSON.parse(t || "{}");
    return { ok: true, id: j.messageId };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Keep Brevo's own list sends (newsletter) in sync with SLEE unsubscribes. */
export async function brevoBlacklist(env: Env, email: string) {
  if (!env.BREVO_API_KEY) return;
  await fetch(`${API}/contacts/${encodeURIComponent(email)}`, {
    method: "PUT",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ emailBlacklisted: true }),
  }).catch(() => {});
}
