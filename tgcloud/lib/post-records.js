import { db, EndpointError } from 'sdk';
import { and, eq } from 'sdk/db';
import { campaignChannels, campaigns, postRecords, users } from '../schema.js';
import { myanmarDateKey } from './client-data.js';

export async function requireApprovedAdmin(ctx) {
  const telegramId = ctx?.initData?.user?.id;
  if (!telegramId) throw new EndpointError('Telegram хэрэглэгчийн мэдээлэл олдсонгүй.', { code: 'NO_TELEGRAM_USER' });
  const admin = await db.select().from(users).where(eq(users.telegramId, telegramId)).get();
  if (!admin || admin.role !== 'admin' || admin.status !== 'approved') {
    throw new EndpointError('Энэ үйлдэл зөвхөн зөвшөөрөгдсөн админд нээлттэй.', { code: 'ADMIN_REQUIRED' });
  }
  return admin;
}

function validTelegramPostUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['t.me', 'telegram.me'].includes(url.hostname) && url.pathname.split('/').filter(Boolean).length >= 2;
  } catch {
    return false;
  }
}

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function saveDailyPostRecord({ campaignId, channelId, postedOn, postUrl }) {
  if (!Number.isInteger(campaignId) || !Number.isInteger(channelId)) {
    throw new EndpointError('Campaign болон channel сонголт буруу байна.', { code: 'INVALID_TARGET' });
  }
  if (!validDateKey(postedOn) || postedOn > myanmarDateKey() || !validTelegramPostUrl(postUrl)) {
    throw new EndpointError('Огноог өнөөдөр эсвэл өмнөх YYYY-MM-DD өдрөөр, холбоосыг Telegram постын https://t.me/... URL хэлбэрээр оруулна уу.', { code: 'INVALID_POST' });
  }
  const campaign = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  const channel = await db.select().from(campaignChannels)
    .where(and(eq(campaignChannels.id, channelId), eq(campaignChannels.campaignId, campaignId)))
    .get();
  if (!campaign || !channel) throw new EndpointError('Campaign эсвэл channel олдсонгүй.', { code: 'NOT_FOUND' });
  const startKey = myanmarDateKey(campaign.startsAt);
  const endKey = myanmarDateKey(campaign.endsAt);
  if (postedOn < startKey || postedOn > endKey) {
    throw new EndpointError('Постын огноо campaign-ийн эхлэх болон дуусах хугацаанд байх ёстой.', { code: 'DATE_OUTSIDE_CAMPAIGN' });
  }
  if (new Date(campaign.startsAt).getTime() + 30 * 86_400_000 <= Date.now()) {
    throw new EndpointError('Энэ campaign-ийн өдөр тутмын post link хадгалах 30 хоногийн хугацаа дууссан.', { code: 'RETENTION_EXPIRED' });
  }

  const existing = await db.select().from(postRecords)
    .where(and(eq(postRecords.channelId, channelId), eq(postRecords.postedOn, postedOn)))
    .get();
  if (existing) {
    await db.update(postRecords).set({ campaignId, postUrl, createdAt: new Date() })
      .where(eq(postRecords.id, existing.id)).run();
    return { id: existing.id, replaced: true, postedOn, postUrl };
  }
  const [record] = await db.insert(postRecords).values({ campaignId, channelId, postedOn, postUrl }).returning().run();
  return { id: record.id, replaced: false, postedOn, postUrl };
}
