# SLEE setup — from zip to live

Everything ships with `DRY_RUN = "true"`: SLEE renders, logs and tracks, but sends nothing until step 9.

## 1. Create the GitHub repo
1. Create a **private** repo `lls-platform` on GitHub.
2. Upload this zip's contents (or `git init && git add . && git commit -m "SLEE v1" && git push`).

## 2. Create the D1 database
```bash
cd workers/slee
npm install
npx wrangler login
npx wrangler d1 create slee
```
Copy the printed `database_id` into `wrangler.toml` → `[[d1_databases]]`. Commit it (it is not a secret).

```bash
npm run db:migrate:remote
```

## 3. Set secrets (never committed)
Generate random values (e.g. `openssl rand -hex 32`) and save them in your password manager.
```bash
npx wrangler secret put HUB_SHARED_SECRET     # also goes into wp-config.php (step 6)
npx wrangler secret put LINK_SECRET
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put BREVO_API_KEY         # Brevo → SMTP & API → API keys
npx wrangler secret put BREVO_WEBHOOK_TOKEN
```

## 4. Edit `wrangler.toml` vars
- `PUBLIC_BASE_URL` — your workers.dev URL for now (shown after first deploy).
- `MAIL_ADDRESS` — **required**: a physical mailing address (CAN-SPAM).
- `SENDER_EMAIL` — must be on a domain authenticated **in Brevo** (Brevo needs its own DKIM record, separate from Zoho's).
- `DAILY_SEND_CAP` — keep under your Brevo plan's daily limit, leaving room for the newsletter.

## 5. Deploy — pick ONE
**A. Cloudflare Workers Builds (recommended, no GitHub secrets):** Cloudflare dashboard → Workers & Pages → Create → Import a repository → pick `lls-platform`.
- Root directory: `workers/slee`
- Build command: `npm ci`
- Deploy command: `npx wrangler d1 migrations apply slee --remote && npx wrangler deploy`

**B. GitHub Actions:** add secrets `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers" + D1 edit) and `CLOUDFLARE_ACCOUNT_ID`, then set repo variable `SLEE_DEPLOY_VIA_ACTIONS = true`.

Check: `curl https://slee.<you>.workers.dev/health` → `{"service":"slee","ok":true}`

**Optional but recommended:** uncomment `routes` in `wrangler.toml` to serve from `slee.legallysingle.com`. Tracked links on your own domain help deliverability. Then update `PUBLIC_BASE_URL`.

## 6. Install the WP bridge
1. Zip `wp-plugins/lls-slee-bridge/` and upload it via WP Admin → Plugins → Add New → Upload, then **Activate**. (Or use the **Deploy WP plugin** workflow once SSH secrets are set.)
2. Add to `wp-config.php`:
   ```php
   define('LLS_SLEE_URL', 'https://slee.<you>.workers.dev');
   define('LLS_SLEE_SECRET', '<same as HUB_SHARED_SECRET>');
   define('LLS_SLEE_ENABLED', true);
   ```
3. **Point HUB's EME bridge at SLEE:** in HUB settings, set the EME endpoint to `https://slee.<you>.workers.dev/v1/event` and activate the bridge. The plugin signs and enriches HUB's requests in flight, so no HUB code changes are needed.
4. Settings → **LLS SLEE** → **Send test event**. You should see ✅, and `lls_hub_generate_identify_url() found`.

## 7. Brevo webhook (bounces, complaints, unsubscribes)
In Brevo, add a **transactional** webhook (under the transactional / SMTP settings; menu names vary by plan):
- URL: `https://slee.<you>.workers.dev/v1/webhooks/brevo?token=<BREVO_WEBHOOK_TOKEN>`
- Events: hard bounce, spam, unsubscribed, blocked, invalid email

## 8. QA in dry run
```bash
export SLEE_URL=https://slee.<you>.workers.dev ADMIN_TOKEN=... HUB_SHARED_SECRET=...
node scripts/send-test-event.mjs you@yourdomain.com sah
curl -H "Authorization: Bearer $ADMIN_TOKEN" "$SLEE_URL/v1/admin/contact?email=you@yourdomain.com"
# Preview any template as HTML (any SAH tier):
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
  "$SLEE_URL/v1/admin/preview" -d '{"template":"sah_nurture_1","contact":{"sah_tier":"SOME","sah_score":8}}' > preview.html
curl -H "Authorization: Bearer $ADMIN_TOKEN" "$SLEE_URL/v1/admin/stats"
```
Take a real SAH quiz on the site with your own email, then confirm the contact appears with `sah_tier` set and `sah_nurture` enrolled.

## 9. Go live
1. Set `DRY_RUN = "false"` in `wrangler.toml` and deploy.
2. Seed test: `POST /v1/admin/test-send {"email":"you@…","template":"re_1"}`. Check Gmail, Yahoo and Outlook inboxes, the one-click unsubscribe, and that the click lands on the site with identity restored.
3. Then let the cron run.

## 10. Legacy re-engagement import (after the Brevo cleanup)
```bash
pip install openpyxl
python scripts/build-legacy-import.py ~/Downloads/Brevo_Segmented_11-3-26.xlsx   # writes ./import (git-ignored)
SLEE_URL=… ADMIN_TOKEN=… node scripts/import-legacy.mjs 2026-11-10              # wave 1 starts that day
```
- **Wave 1** (2025 lists) starts on day 0, **wave 2** (2024) on +3d, **wave 3** (2025 imports) on +7d, and **wave 4** (2023) on +14d.
- **Bots and suspect addresses** are stored as suppressed and never mailed, unless they later take a quiz or opt in themselves.
- **Throttling:** `DAILY_SEND_CAP` paces the whole thing automatically.
- **Watch `/v1/admin/stats` daily.** Pause if complaints rise by setting `DAILY_SEND_CAP = "0"` and deploying.

## Free-plan budget
| Limit (free) | SLEE usage |
|---|---|
| Worker requests 100k/day | ~300 cron runs plus events and clicks |
| D1 50 queries per invocation | scheduler ≤ ~45 (BATCH_SIZE ≤ 8); import 3 per 400 contacts; event ~12 |
| D1 storage 5 GB | well under 100 MB for years |
| CPU 10 ms per invocation | rendering and HMAC are sub-ms; the rest is I/O |

These limits can change; check Cloudflare's current pricing page.
