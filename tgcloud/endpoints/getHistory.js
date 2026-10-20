import { db } from 'sdk';
import { and, eq, lt } from 'sdk/db';
import { campaignChannels, campaigns } from '../schema.js';
import { pruneExpiredPostRecords, requireApprovedClient } from '../lib/client-data.js';

export default async function (_input, ctx) {
  await pruneExpiredPostRecords();
  const user = await requireApprovedClient(ctx);
  const rows = await db.select().from(campaigns)
    .where(and(eq(campaigns.clientId, user.id), lt(campaigns.endsAt, new Date())))
    .all();
  const history = await Promise.all(rows.map(async (campaign) => ({
    id: campaign.id,
    name: campaign.name,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    usedBudgetKs: campaign.usedBudgetKs,
    channelCount: await db.$count(campaignChannels, eq(campaignChannels.campaignId, campaign.id)),
  })));
  return { history };
}
