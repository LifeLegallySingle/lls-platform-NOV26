# lls-platform

Monorepo for the Life Legally Single™ platform. WordPress stays the CMS; everything new is code in Git.

| Path | What | Deploys to |
|---|---|---|
| `workers/slee/` | **SLEE — Single Life Email Engine** (Worker + D1) | Cloudflare (free plan) |
| `wp-plugins/lls-slee-bridge/` | HUB ⇄ SLEE bridge plugin | Lightsail WordPress |
| `wp-plugins/lls-hub/` | LLS HUB (to be moved in — see `docs/HUB-MIGRATION.md`) | Lightsail WordPress |
| `packages/event-schema/` | Event contract shared by PHP + Workers | — |
| `.github/workflows/` | CI, SLEE deploy, WP plugin deploy (with backup) | — |
| `docs/` | Setup, architecture, HUB migration | — |

## How SLEE works (one paragraph)
HUB stays the identity source of truth. Every HUB identity write (SAH, GloType, Power Move, Freedom Tax™, Datēbase, opt-in) is signed by the bridge plugin and sent to SLEE. SLEE merges the attributes, **detects what changed** (e.g. a new SAH score), enrolls the person in the right journey, personalizes each email by SAH tier / GloType / Power Move / CIA tier, and sends through **Brevo**. Every CTA restores the person's HUB identity, and clicks/unsubscribes/bounces flow back to HUB.

## Quick start
See **`docs/SETUP.md`** — about 45 minutes end-to-end. It ships in `DRY_RUN` mode, so nothing is emailed until you flip it.

```bash
cd workers/slee && npm install
npx wrangler login
npx wrangler d1 create slee              # paste database_id into wrangler.toml
npm run db:migrate:remote
npx wrangler secret put HUB_SHARED_SECRET   # + LINK_SECRET, ADMIN_TOKEN, BREVO_API_KEY, BREVO_WEBHOOK_TOKEN
npx wrangler deploy
```
