#!/usr/bin/env node
// Uploads ./import/*.json to SLEE in 400-contact chunks.
// SLEE_URL=https://slee.xxx.workers.dev ADMIN_TOKEN=... node scripts/import-legacy.mjs [YYYY-MM-DD start date, default today]
import { readdirSync, readFileSync } from "node:fs";

const url = (process.env.SLEE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const token = process.env.ADMIN_TOKEN || "dev-admin-token";
const base = process.argv[2] ? new Date(process.argv[2] + "T15:00:00Z") : new Date(); // 15:00 UTC ≈ 10–11am ET
const files = readdirSync("import").filter((f) => f.endsWith(".json")).sort();
if (!files.length) { console.error("No import/*.json — run build-legacy-import.py first"); process.exit(1); }

for (const f of files) {
  const b = JSON.parse(readFileSync(`import/${f}`, "utf8"));
  const start = new Date(base.getTime() + b.start_offset_days * 864e5).toISOString();
  const tot = {};
  for (let i = 0; i < b.contacts.length; i += 400) {
    const r = await fetch(`${url}/v1/admin/import`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ contacts: b.contacts.slice(i, i + 400), ...(b.enroll ? { enroll: b.enroll, start_at: start } : {}) }),
    });
    const j = await r.json();
    if (!r.ok) { console.error(f, r.status, j); process.exit(1); }
    for (const [k, v] of Object.entries(j)) if (typeof v === "number") tot[k] = (tot[k] || 0) + v;
  }
  console.log(`${f}: ${JSON.stringify(tot)}${b.enroll ? `  → ${b.enroll} from ${start.slice(0, 10)}` : ""}`);
}
