import { db } from 'sdk';
import { and, eq, gte, lte } from 'sdk/db';
import { campaigns, postRecords } from '../schema.js';
import { channelsFor, myanmarDateKey, pruneExpiredPostRecords, requireApprovedClient } from '../lib/client-data.js';

export default async function (_input, ctx) {
  await pruneExpiredPostRecords();
  const user = await requireApprovedClient(ctx);
  const today = myanmarDateKey();
  const todayDate = new Date(`${today}T00:00:00+06:30`);
  const active = await db.select().from(campaigns)
    .where(and(eq(campaigns.clientId, user.id), lte(campaigns.startsAt, new Date()), gte(campaigns.endsAt, todayDate)))
    .all();

  const items = await Promise.all(active.map(async (campaign) => {
    const channels = await channelsFor(campaign.id);
    const posts = await db.select().from(postRecords).where(eq(postRecords.campaignId, campaign.id)).all();
    return {
      id: campaign.id,
      name: campaign.name,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      usedBudgetKs: campaign.usedBudgetKs,
      channels: channels.map((channel) => ({
        id: channel.id,
        name: channel.channelName,
        url: channel.channelUrl,
        postedCount: posts.filter((post) => post.channelId === channel.id).length,
        dailyTarget: 30,
      })),
    };
  }));

  return { client: { firstName: user.firstName }, today, campaigns: items };
}
