# Client Mini App — TGCloud Serverless package

This package combines a React + Vite Telegram Mini App with TGCloud Serverless modules. The Mini App has Dashboard, History and Loyalty Point tabs. In Telegram it requests data through authenticated Serverless endpoints; in a normal browser it shows clearly labelled demo data.

## Local preview

Requires Node.js 20.19+ (or 22.12+) and npm, matching Vite 8 requirements.

```bash
npm install
npm run dev
npm run build
npm run lint
```

## TGCloud setup

1. Enable Serverless for the bot in BotFather.
2. Obtain the **Serverless CLI access token** from BotFather. This is separate from the Telegram Bot API token. Run `npx tgcloud login` locally and enter the CLI credential only in that terminal prompt. Never place either token in source code or chat.
3. Run `npm run deploy`. It builds the Mini App and runs `tgcloud push` for the code and static files. Note the TGCloud app URL returned by the CLI and set it as the Mini App URL in BotFather.
4. Review the pending schema changes reported by TGCloud. Only when they are correct, run `npx tgcloud migrate` to apply the database changes.

This package has not logged in, pushed modules, applied a database migration or deployed anything. Review the migration before applying it.

## Included data logic

Campaign summaries, channel assignments, daily post links, delivery audit rows and 60-day loyalty-cycle records are represented in `tgcloud/schema.js`. A daily link is keyed by channel and Myanmar-local date; saving a replacement for that same day updates the link. The retention routine deletes only daily post-link rows after 30 days from campaign start and retains campaign summaries.

Points are calculated as `floor((used budget in the active 60-day cycle × 5%) / 1,000 Ks)`. Fractional points are rounded down. The first campaign start anchors the cycle. A new cycle is created after 60 days; prior-cycle points are not carried forward.

## Important platform limitation

The official TGCloud documentation reviewed for this package does not describe a cron or timer trigger. Expired post links are therefore swept on the next bot or Mini App endpoint request, not guaranteed to be deleted exactly at the 30-day instant. A separate scheduler is required for a daily 22:30 Myanmar Standard Time reminder and strict-time cleanup.

## Not implemented yet

The current package is a Mini App and database-logic foundation, not a complete production bot. Client onboarding approval, secure first-admin setup, campaign administration, `/tabname` report history, client report sending and unsent-day continuation, user listing, one-to-one/all-user broadcasts, and the scheduled reminder still need implementation. Deploy only after these authorization and admin flows are complete.

If a Bot API token has ever been exposed publicly or in an untrusted chat, revoke it in BotFather and replace it. Never commit tokens or share them in chat.

## Official platform references

- Telegram Serverless: https://core.telegram.org/bots/serverless
- Telegram Mini Apps: https://core.telegram.org/bots/webapps
