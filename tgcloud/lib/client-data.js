import { db, EndpointError } from 'sdk';
import { and, asc, desc, eq, gte, inArray, lt } from 'sdk/db';
import { campaignChannels, campaigns, loyaltyCycles, postRecords, users } from '../schema.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CYCLE_DAYS = 60;
const POST_RETENTION_DAYS = 30;
const MYANMAR_OFFSET_MINUTES = 6 * 60 + 30;

export function myanmarDateKey(date = new Date()) {
  const local = new Date(date.getTime() + MYANMAR_OFFSET_MINUTES * 60 * 1000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Removes only daily post-link rows once 30 full days have elapsed since a
 * campaign's start. Campaigns, channel assignments, budgets and report-delivery
 * summaries are intentionally retained.
 *
 * TGCloud Serverless currently has no native cron/timer module in its documented
 * SDK, so this idempotent cleanup runs on bot/endpoint activity. For a strict
 * wall-clock deletion deadline, an external scheduler must invoke this routine.
 */
export async function pruneExpiredPostRecords(now = new Date()) {
  const cutoff = new Date(now.getTime() - POST_RETENTION_DAYS * DAY_MS);
  const expired = await db.select({ id: campaigns.id })
    .from(campaigns)
    .where(lt(campaigns.startsAt, cutoff))
    .all();
  const ids = expired.map((row) => row.id);
  if (ids.length === 0) return 0;
  const result = await db.delete(postRecords)
    .where(inArray(postRecords.campaignId, ids))
    .run();
  return result.rowsAffected;
}

export async function requireApprovedClient(ctx) {
  const telegramId = ctx?.initData?.user?.id;
  if (!telegramId) throw new EndpointError('Telegram хэрэглэгчийн мэдээлэл олдсонгүй.', { code: 'NO_TELEGRAM_USER' });
  const user = await db.select().from(users).where(eq(users.telegramId, telegramId)).get();
  if (!user || user.status !== 'approved' || user.role !== 'client') {
    throw new EndpointError('Таны бүртгэлийг админ хараахан зөвшөөрөөгүй байна.', { code: 'PENDING_APPROVAL' });
  }
  return user;
}

export async function listCurrentCampaigns(clientId, now = new Date()) {
  return db.select().from(campaigns)
    .where(and(
      eq(campaigns.clientId, clientId),
      lt(campaigns.startsAt, new Date(now.getTime() + 1)),
      gte(campaigns.endsAt, now),
    ))
    .orderBy(asc(campaigns.startsAt))
    .all();
}

export async function channelsFor(campaignId) {
  return db.select().from(campaignChannels)
    .where(eq(campaignChannels.campaignId, campaignId))
    .orderBy(asc(campaignChannels.id))
    .all();
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

export async function getOrCreateLoyaltyCycle(clientId, now = new Date()) {
  let cycle = await db.select().from(loyaltyCycles)
    .where(eq(loyaltyCycles.clientId, clientId))
    .orderBy(desc(loyaltyCycles.startsAt))
    .get();

  if (!cycle) {
    const firstCampaign = await db.select().from(campaigns)
      .where(eq(campaigns.clientId, clientId))
      .orderBy(asc(campaigns.startsAt))
      .get();
    const anchor = firstCampaign?.startsAt ?? now;
    let startsAt = anchor;
    let endsAt = addDays(startsAt, CYCLE_DAYS);
    while (endsAt.getTime() <= now.getTime()) {
      startsAt = endsAt;
      endsAt = addDays(startsAt, CYCLE_DAYS);
    }
    const [created] = await db.insert(loyaltyCycles).values({
      clientId,
      startsAt,
      endsAt,
      usedBudgetKs: 0,
      earnedPoints: 0,
      redeemedPoints: 0,
      updatedAt: now,
    }).returning().run();
    cycle = created;
  } else if (cycle.endsAt.getTime() <= now.getTime()) {
    let startsAt = cycle.endsAt;
    let endsAt = addDays(startsAt, CYCLE_DAYS);
    while (endsAt.getTime() <= now.getTime()) {
      startsAt = endsAt;
      endsAt = addDays(startsAt, CYCLE_DAYS);
    }
    const [created] = await db.insert(loyaltyCycles).values({
      clientId,
      startsAt,
      endsAt,
      usedBudgetKs: 0,
      earnedPoints: 0,
      redeemedPoints: 0,
      updatedAt: now,
    }).returning().run();
    cycle = created;
  }

  const cycleCampaigns = await db.select().from(campaigns)
    .where(and(
      eq(campaigns.clientId, clientId),
      gte(campaigns.startsAt, cycle.startsAt),
      lt(campaigns.startsAt, cycle.endsAt),
    ))
    .all();
  const usedBudgetKs = cycleCampaigns.reduce((sum, campaign) => sum + Math.max(0, campaign.usedBudgetKs), 0);
  const earnedPoints = Math.floor((usedBudgetKs * 0.05) / 1000);

  await db.update(loyaltyCycles)
    .set({ usedBudgetKs, earnedPoints, updatedAt: now })
    .where(eq(loyaltyCycles.id, cycle.id))
    .run();

  return {
    startsAt: cycle.startsAt,
    endsAt: cycle.endsAt,
    usedBudgetKs,
    earnedPoints,
    redeemedPoints: cycle.redeemedPoints,
    availablePoints: Math.max(0, earnedPoints - cycle.redeemedPoints),
    pointRate: '1,000 Ks = 1 point',
    earningRate: 'used budget-ийн 5%',
  };
}

export async function getCampaignRecords(campaignId) {
  const channels = await channelsFor(campaignId);
  const rows = await db.select().from(postRecords)
    .where(eq(postRecords.campaignId, campaignId))
    .orderBy(asc(postRecords.postedOn))
    .all();
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  return rows.map((record) => ({
    date: record.postedOn,
    channel: channelById.get(record.channelId)?.channelName ?? 'Channel',
    postRecord: record.postUrl,
  }));
}
