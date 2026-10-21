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

Admin access is restricted to Telegram numeric user IDs listed in `tgcloud/lib/admin-config.js`. Keep the public GitHub version empty; add the trusted IDs only in the private deployment workspace. `/start` registers an allowlisted ID as an approved admin. Users not on the list remain pending clients. Do not commit private IDs to this public repository.

The report sender records successful delivery by client, campaign and Myanmar-local date. Re-sending a report skips dates already recorded as delivered. If Telegram accepted a message but saving its delivery marker failed, a later resend could duplicate that date; delivery is therefore retryable, not exactly-once.

## TGCloud setup and deployment

1. Enable Serverless for the bot in BotFather.
2. Revoke and replace any Telegram Bot API token or TGCloud CLI token previously exposed in chat or elsewhere. Keep both credentials out of source code and chat.
3. Obtain the TGCloud Serverless CLI access token from BotFather. It is separate from the Telegram Bot API token. Run `npx tgcloud login` locally and enter the CLI credential only in the terminal prompt.
4. Add the trusted Telegram numeric IDs to `tgcloud/lib/admin-config.js` in the private deployment workspace only. Keep the public GitHub version empty; do not commit the IDs.
5. Link/pull the target bot with the TGCloud CLI, inspect `npx tgcloud status`, then review any reported schema changes. Apply a migration only after checking the generated change set.
6. Run `npm run deploy` to build the Mini App and push the modules/static files. Set the returned app URL as the Mini App URL in BotFather, then test onboarding and admin commands using one of the allowlisted Telegram accounts.

This repository has not logged in to a bot, linked or pulled a TGCloud app, pushed modules/static files, applied a migration, or deployed anything. The deployment workflow is pending bot linking, review of the remote state, and rotated credentials.

## Data and retention

Campaign summaries, channel assignments, daily post links, delivery audit rows and 60-day loyalty-cycle records are represented in `tgcloud/schema.js`. A daily link is keyed by channel and Myanmar-local date; saving a replacement for that same day updates the link. The retention routine deletes daily post-link rows after 30 days from campaign start while retaining campaign summaries.

Points are calculated as `floor((used budget in the active 60-day cycle × 5%) / 1,000 Ks)`. Fractional points are rounded down. The first campaign start anchors the cycle. A new cycle is created after 60 days; prior-cycle points are not carried forward.

## Reminder scheduling limitation

The official TGCloud documentation reviewed for this package does not describe a cron or timer trigger. `/remindnow` runs the missing-post check immediately when an admin invokes it; it is not a scheduled 22:30 reminder. A separate supported scheduler/service must invoke the bot or an endpoint at 22:30 Myanmar Standard Time. Expired post links are swept on the next dashboard/history/loyalty or bot report/post request, not guaranteed to be deleted exactly at the 30-day instant.

## Official platform references

- Telegram Serverless: https://core.telegram.org/bots/serverless
- Telegram Mini Apps: https://core.telegram.org/bots/webapps
