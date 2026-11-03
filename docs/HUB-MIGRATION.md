# Moving HUB + product plugins into this repo

**Goal:** every plugin is versioned in Git, reviewed via PR, and deployed with a one-click workflow that backs up first.

## 1. Pull the live code down (one time)
```bash
# from your laptop
rsync -az <site-user>@<lightsail-ip>:~/htdocs/legallysingle.com/wp-content/plugins/lls-hub/ wp-plugins/lls-hub/
# repeat for: sah_quiz, glotype, power_move_optin, ailife_coach (use their exact folder names)
git add wp-plugins && git commit -m "Import live plugins from production" && git push
```
Strip anything secret (API keys) out of the code into `wp-config.php` constants **before** committing.

## 2. Enable the deploy workflow
GitHub → Settings → Secrets → Actions:
- `LIGHTSAIL_HOST`, `LIGHTSAIL_USER` (CloudPanel site user), `LIGHTSAIL_SSH_KEY` (a deploy key added to that user's `~/.ssh/authorized_keys`)
- `WP_ROOT` = `/home/<site-user>/htdocs/legallysingle.com`

Create an Environment called `production` with yourself as required reviewer. That gives every plugin deploy an approval click.

## 3. Ship changes
Edit → PR → CI lint passes → merge → Actions → **Deploy WP plugin** → pick the folder.
The workflow tars the current server copy to `~/plugin-backups/` first. To roll back, untar the latest backup.

## 4. Order of operations (suggested)
1. `lls-slee-bridge` (already here)
2. `lls-hub`: then remove reliance on the in-flight signing filter by calling `lls_slee_emit()` directly inside `lls_hub_eme_emit()`.
3. Product plugins: bump each version on every change.
4. Later, per the Cloudflare migration plan, move individual tools to Workers under `workers/<tool>/`. They speak the same event contract in `packages/event-schema/`.
