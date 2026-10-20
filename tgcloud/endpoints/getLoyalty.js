import { pruneExpiredPostRecords, requireApprovedClient, getOrCreateLoyaltyCycle } from '../lib/client-data.js';

export default async function (_input, ctx) {
  await pruneExpiredPostRecords();
  const user = await requireApprovedClient(ctx);
  return getOrCreateLoyaltyCycle(user.id);
}
