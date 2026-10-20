import { EndpointError } from 'sdk';
import { myanmarDateKey, pruneExpiredPostRecords } from '../lib/client-data.js';
import { requireApprovedAdmin, saveDailyPostRecord } from '../lib/post-records.js';

export default async function (input, ctx) {
  await pruneExpiredPostRecords();
  await requireApprovedAdmin(ctx);
  const campaignId = Number(input?.campaignId);
  const channelId = Number(input?.channelId);
  const postedOn = typeof input?.postedOn === 'string' ? input.postedOn : myanmarDateKey();
  const postUrl = typeof input?.postUrl === 'string' ? input.postUrl.trim() : '';
  if (!postUrl) throw new EndpointError('Post link оруулна уу.', { code: 'POST_LINK_REQUIRED' });
  return saveDailyPostRecord({ campaignId, channelId, postedOn, postUrl });
}
