#!/usr/bin/env node
// Sends a signed test event to SLEE exactly the way the WP bridge does.
// Usage: SLEE_URL=https://slee.xxx.workers.dev HUB_SHARED_SECRET=... node scripts/send-test-event.mjs you@example.com [sah|power|glotype|ft|optin]
import { createHmac, randomUUID } from "node:crypto";

const url = (process.env.SLEE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const secret = process.env.HUB_SHARED_SECRET || "dev-hub-secret-change-me";
const email = process.argv[2] || "test+slee@example.com";
const kind = process.argv[3] || "sah";

const presets = {
  sah: { type: "sah_quiz", attrs: { SAH_SCORE: 13, SAH_STATUS: "Congratulations – you are single at heart.", FIRSTNAME: "Test" } },
  power: { type: "power_move_optin", attrs: { POWER_MOVE: "Wallet", PM_SOURCE: "https://legallysingle.com/" } },
  glotype: { type: "glotype", attrs: { GLOTYPE_ELEMENT: "Lagoon", GLOTYPE_SCORE: 42 } },
  ft: { type: "freedom_tax", attrs: { STR_FREEDOM_TAX: "48210" } },
  optin: { type: "lls_hub_optin", attrs: { PAGE_SOURCE: "https://legallysingle.com/" } },
};
const p = presets[kind];
if (!p) { console.error("kind must be one of", Object.keys(presets)); process.exit(1); }

const body = JSON.stringify({ event_id: randomUUID(), type: p.type, email, hub_id: "test-" + email, attributes: p.attrs,
  identify_qs: "lls_id=test&lls_sig=test", occurred_at: new Date().toISOString() });
const ts = String(Math.floor(Date.now() / 1000));
const sig = "sha256=" + createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

const r = await fetch(`${url}/v1/event`, { method: "POST", headers: { "content-type": "application/json", "X-LLS-Timestamp": ts, "X-LLS-Signature": sig }, body });
console.log(r.status, await r.text());
