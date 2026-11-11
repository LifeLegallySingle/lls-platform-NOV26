/**
 * SLEE — Single Life Email Engine
 * Cloudflare Worker + D1 (free plan). HUB is the identity source of truth; SLEE owns journeys; Brevo delivers.
 *
 *   POST /v1/event                 HUB -> SLEE identity/product events (HMAC)
 *   GET  /c/:send/:dest/:sig       tracked click -> HUB identity restore redirect
 *   GET|POST /u/:id/:sig           unsubscribe (RFC 8058 one-click)
 *   POST /v1/webhooks/brevo        bounces/complaints/unsubs from Brevo
 *   *    /v1/admin/*               stats, contact lookup, import, enroll, suppress, preview, test-send (Bearer)
 *   cron every 5 min                scheduler + HUB feedback outbox
 */
import type { Env } from "./env";
import { json, requireAdmin } from "./lib/http";
import { handleEvent } from "./routes/event";
import { handleClick } from "./routes/click";
import { handleUnsub } from "./routes/unsub";
import { handleBrevoWebhook } from "./routes/brevo-webhook";
import { handleAdmin } from "./routes/admin";
import { runScheduler } from "./engine/scheduler";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const parts = path.split("/").filter(Boolean);

    try {
      if (path === "/" || path === "/health") return json({ service: "slee", ok: true, version: "1.6.0" });
      if (req.method === "POST" && path === "/v1/event") return await handleEvent(req, env, ctx);
      if (req.method === "GET" && parts[0] === "c" && parts.length === 4) return await handleClick(req, env, ctx, parts[1], parts[2], parts[3]);
      if (parts[0] === "u" && parts.length === 3 && (req.method === "GET" || req.method === "POST")) return await handleUnsub(req, env, ctx, parts[1], parts[2]);
      if (req.method === "POST" && path === "/v1/webhooks/brevo") return await handleBrevoWebhook(req, env, ctx);
      if (path.startsWith("/v1/admin/")) {
        if (!requireAdmin(req, env.ADMIN_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
        return await handleAdmin(req, env, ctx, path);
      }
      return json({ ok: false, error: "not_found" }, 404);
    } catch (e) {
      console.error("slee_error", path, e);
      return json({ ok: false, error: "internal_error" }, 500);
    }
  },

  async scheduled(_ev: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduler(env).then((r) => console.log("slee_scheduler", JSON.stringify(r))));
  },
} satisfies ExportedHandler<Env>;
