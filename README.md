# Client Mini App — TGCloud Serverless package

This package combines a React + Vite Telegram Mini App with TGCloud Serverless modules. The Mini App has Dashboard, History and Loyalty Point tabs. In Telegram it requests data through authenticated Serverless endpoints; in a normal browser it shows clearly labelled demo data.

## Local checks

Requires Node.js 20.19+ (or 22.12+) and npm, matching Vite 8 requirements.

```bash
npm ci
npm run build
npm run lint
```

## Bot workflows

The message and callback handlers implement private-chat onboarding, pending-user review, admin authorization, campaign/channel management, daily post recording, report display/delivery and manual missing-post reminders. See [BOT_GUIDE.md](BOT_GUIDE.md) for commands and setup details.

Admin access uses `/admin <password>`. The bot verifies a PBKDF2-SHA256 password hash from `tgcloud/lib/admin-config.js`; leave it empty in public commits, and configure the real hash only in the private deployment workspace. The first user to message the bot is not automatically an admin; only a successful password login grants the sender's Telegram account admin status. Use a unique password of at least 20 characters. Failed login attempts are limited in the current worker process. Password text is sent to Telegram in a private message; the handler attempts to delete the command message, but deletion is not guaranteed, so do not reuse a sensitive password. `/logout` demotes the account to a pending client; an approved admin must re-approve it for client access.

The report sender records successful delivery by client, campaign and Myanmar-local date. Re-sending a report skips dates already recorded as delivered. If Telegram accepted a message but saving its delivery marker failed, a later resend could duplicate that date; delivery is therefore retryable, not exactly-once.

## TGCloud setup and deployment

1. Enable Serverless for the bot in BotFather.
2. Revoke and replace any Telegram Bot API token or TGCloud CLI token previously exposed in chat or elsewhere. Keep both credentials out of source code and chat.
3. Obtain the TGCloud Serverless CLI access token from BotFather. It is separate from the Telegram Bot API token. Run `npx tgcloud login` locally and enter the CLI credential only in the terminal prompt.
4. Set a PBKDF2-SHA256 hash for a long, unique admin password in `tgcloud/lib/admin-config.js` in the private deployment workspace only. Never commit a populated hash to the public repository.
5. Link/pull the target bot with the TGCloud CLI, inspect `npx tgcloud status`, then review any reported schema changes. Apply a migration only after checking the generated change set.
6. Run `npm run deploy` to build the Mini App and push the modules/static files. Set the returned app URL as the Mini App URL in BotFather, then test onboarding and admin commands with the configured administrator.

This repository has not logged in to a bot, linked or pulled a TGCloud app, pushed modules/static files, applied a migration, or deployed anything. The deployment workflow is intentionally left for a separate, confirmed step after coding and credential rotation.

## Data and retention

Campaign summaries, channel assignments, daily post links, delivery audit rows and 60-day loyalty-cycle records are represented in `tgcloud/schema.js`. A daily link is keyed by channel and Myanmar-local date; saving a replacement for that same day updates the link. The retention routine deletes daily post-link rows after 30 days from campaign start while retaining campaign summaries.

Points are calculated as `floor((used budget in the active 60-day cycle × 5%) / 1,000 Ks)`. Fractional points are rounded down. The first campaign start anchors the cycle. A new cycle is created after 60 days; prior-cycle points are not carried forward.

## Reminder scheduling limitation

The official TGCloud documentation reviewed for this package does not describe a cron or timer trigger. `/remindnow` runs the missing-post check immediately when an admin invokes it; it is not a scheduled 22:30 reminder. A separate supported scheduler/service must invoke the bot or an endpoint at 22:30 Myanmar Standard Time. Expired post links are swept on the next dashboard/history/loyalty or bot report/post request, not guaranteed to be deleted exactly at the 30-day instant.

## Official platform references

- Telegram Serverless: https://core.telegram.org/bots/serverless
- Telegram Mini Apps: https://core.telegram.org/bots/webapps
