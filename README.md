# Client Management & Daily Post Record Bot (TGCloud Suite)

This package combines a Telegram Bot and React + Vite Telegram Mini App running on Telegram's Serverless platform (TGCloud). It provides complete client onboarding, user checking (1-by-1 inspection & approval), broadcasting (all or individual), daily post record tracking by campaign tab, `/tabname` history reports with incremental delivery ("Send to Client"), 30-day auto-cleanup, and daily 22:30 MMT reminders.

---

## Key Features

1. **User Management & 1-by-1 Inspection**:
   - Automatic first-user admin bootstrap.
   - Interactive `/users` 1-by-1 profile review card with `[Next]`, `[Prev]`, `[Approve]`, `[Reject]`, and `[Pending]` buttons.
   - `/user <id>` for direct inspection.
2. **Broadcasting**:
   - `/broadcast <message>` to all approved clients with delivery summary.
   - `/sendto <telegram_id> <message>` for direct one-on-one client communication.
3. **Daily Post Record & Tab Tracking**:
   - `/newtab <TabName> | <ChannelName> | <StartDate>` creates 30-day campaign tabs (e.g. `/newtab Ngwe Oah | Yangon Daily | 2026-09-24`).
   - `/addpost <TabName> <PostLink>` records daily post links (keyed by channel and Myanmar-local date).
   - `/tabs` lists all active tabs and current post count.
4. **Report History (`/tabname`) & Incremental Delivery**:
   - Calling `/<tabname>` (e.g., `/NgweOah`) displays `Date | Channel | Post Record` table.
   - `[Send to client]` button opens an approved client picker.
   - The bot checks `report_deliveries` and delivers only the new unsent dates up to current date (preventing duplicate sends).
5. **30-Day Auto Cleanup**:
   - Post link records are automatically pruned after 30 days from campaign start.
6. **22:30 MMT Reminder (Method 1: Scheduled Webhook/CLI)**:
   - `/remindnow` command for instant manual testing.
   - `tgcloud/endpoints/cronReminder.js` checks missing daily links across active tabs and alerts admins.
   - `.github/workflows/daily-reminder.yml` triggers the cron reminder daily at 16:00 UTC (22:30 MMT).

---

## Documentation

- User Guide & Commands (Burmese): `docs/BOT_GUIDE.md`
- SDK Reference: `docs/tgcloud-sdk.md`
- Developer Architecture: `AGENTS.md`
