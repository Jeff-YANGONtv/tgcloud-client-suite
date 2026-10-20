import { boolean, index, integer, sql, table, text, uniqueIndex } from 'sdk/db';

export const users = table('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telegramId: integer('telegram_id').notNull().unique(),
  username: text('username'),
  firstName: text('first_name').notNull(),
  role: text('role').notNull().default('client'),
  status: text('status').notNull().default('pending'),
  approvedAt: integer('approved_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

export const campaigns = table('campaigns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').notNull(),
  name: text('name').notNull(),
  startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp' }).notNull(),
  usedBudgetKs: integer('used_budget_ks').notNull().default(0),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({ clientIdx: index('idx_campaign_client').on(t.clientId, t.startsAt) }));

export const campaignChannels = table('campaign_channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: integer('campaign_id').notNull(),
  channelName: text('channel_name').notNull(),
  channelUrl: text('channel_url'),
}, (t) => ({ campaignIdx: index('idx_channel_campaign').on(t.campaignId) }));

export const postRecords = table('post_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: integer('campaign_id').notNull(),
  channelId: integer('channel_id').notNull(),
  postedOn: text('posted_on').notNull(),
  postUrl: text('post_url').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  uniqueDailyPost: uniqueIndex('uq_post_channel_day').on(t.channelId, t.postedOn),
  campaignIdx: index('idx_post_campaign').on(t.campaignId, t.postedOn),
}));

export const reportDeliveries = table('report_deliveries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').notNull(),
  campaignId: integer('campaign_id').notNull(),
  postedOn: text('posted_on').notNull(),
  sentAt: integer('sent_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  succeeded: boolean('succeeded').notNull().default(true),
}, (t) => ({
  uniqueDelivery: uniqueIndex('uq_report_delivery').on(t.clientId, t.campaignId, t.postedOn),
  clientIdx: index('idx_delivery_client').on(t.clientId, t.postedOn),
}));

export const loyaltyCycles = table('loyalty_cycles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientId: integer('client_id').notNull(),
  startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp' }).notNull(),
  usedBudgetKs: integer('used_budget_ks').notNull().default(0),
  earnedPoints: integer('earned_points').notNull().default(0),
  redeemedPoints: integer('redeemed_points').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  uniqueClientCycle: uniqueIndex('uq_loyalty_client_cycle').on(t.clientId, t.startsAt),
  clientIdx: index('idx_loyalty_client_end').on(t.clientId, t.endsAt),
}));
