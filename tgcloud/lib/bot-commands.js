import { api, db } from 'sdk';
import { and, asc, eq, gte, lte } from 'sdk/db';
import { campaignChannels, campaigns, postRecords, reportDeliveries, users } from '../schema.js';
import { myanmarDateKey, pruneExpiredPostRecords } from './client-data.js';
import { saveDailyPostRecord } from './post-records.js';
import { ADMIN_TELEGRAM_IDS } from './admin-config.js';

const DAY_MS = 86_400_000;
const MM_OFFSET_MS = (6 * 60 + 30) * 60_000;
const MESSAGE_LIMIT = 3_700;

function textOf(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function commandParts(text) {
  const match = text.match(/^\/([A-Za-z0-9_-]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/);
  return match ? { name: match[1].toLowerCase(), args: (match[2] ?? '').trim() } : null;
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function myanmarMidnight(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - MM_OFFSET_MS);
}

function displayDate(value) {
  return myanmarDateKey(value);
}

function chunksByLines(text, limit = MESSAGE_LIMIT) {
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (line.length > limit) {
      if (current) chunks.push(current);
      current = '';
      for (let i = 0; i < line.length; i += limit) chunks.push(line.slice(i, i + limit));
      continue;
    }
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > limit && current) {
      chunks.push(current);
      current = line;
    } else current = candidate;
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [' '];
}

async function sendText(chatId, text, replyMarkup) {
  const chunks = chunksByLines(text);
  for (let i = 0; i < chunks.length; i += 1) {
    await api.sendMessage({
      chat_id: chatId,
      text: chunks[i],
      ...(i === chunks.length - 1 && replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }
}

function adminKeyboard(userId) {
  return { inline_keyboard: [[
    { text: '✅ Approve', callback_data: `u:a:${userId}` },
    { text: '❌ Reject', callback_data: `u:r:${userId}` },
  ]] };
}

function userCard(user, index, total) {
  return [
    `Pending user ${index + 1} of ${total}`,
    `Name: ${user.firstName}`,
    `Username: ${user.username ? `@${user.username}` : '—'}`,
    `Telegram ID: ${user.telegramId}`,
    `Database ID: ${user.id}`,
    `Requested: ${user.createdAt ? displayDate(user.createdAt) : 'unknown'}`,
  ].join('\n');
}

async function pendingUsers() {
  return db.select().from(users)
    .where(eq(users.status, 'pending'))
    .orderBy(asc(users.createdAt), asc(users.id))
    .all();
}

async function sendPendingCard(chatId, offset = 0, messageId = null) {
  const rows = await pendingUsers();
  if (rows.length === 0) {
    const text = 'လက်ရှိ စောင့်ဆိုင်းနေသော request မရှိပါ။';
    if (messageId) await api.editMessageText({ chat_id: chatId, message_id: messageId, text, reply_markup: { inline_keyboard: [] } });
    else await sendText(chatId, text);
    return;
  }
  const index = Math.max(0, Math.min(rows.length - 1, offset));
  const user = rows[index];
  const keyboard = [adminKeyboard(user.id)[0]];
  const navigation = [];
  if (index > 0) navigation.push({ text: '⬅ ရှေ့သို့', callback_data: `u:p:${index - 1}` });
  if (index + 1 < rows.length) navigation.push({ text: 'နောက်သို့ ➡', callback_data: `u:p:${index + 1}` });
  navigation.push({ text: '↻ ပြန်စစ်မည်', callback_data: `u:p:${index}` });
  keyboard.push(navigation);
  const text = userCard(user, index, rows.length);
  if (messageId) await api.editMessageText({ chat_id: chatId, message_id: messageId, text, reply_markup: { inline_keyboard: keyboard } });
  else await api.sendMessage({ chat_id: chatId, text, reply_markup: { inline_keyboard: keyboard } });
}

async function findUserByEitherId(id) {
  const byTelegramId = await db.select().from(users).where(eq(users.telegramId, id)).get();
  return byTelegramId ?? db.select().from(users).where(eq(users.id, id)).get();
}

function userDetail(user) {
  return [
    `User profile`,
    `Name: ${user.firstName}`,
    `Username: ${user.username ? `@${user.username}` : '—'}`,
    `Telegram ID: ${user.telegramId}`,
    `Database ID: ${user.id}`,
    `Role: ${user.role}`,
    `Status: ${user.status}`,
    `Created: ${user.createdAt ? displayDate(user.createdAt) : 'unknown'}`,
  ].join('\n');
}

async function getApprovedAdmin(telegramId) {
  return db.select().from(users)
    .where(and(eq(users.telegramId, telegramId), eq(users.role, 'admin'), eq(users.status, 'approved')))
    .get();
}

async function sendAdmins(text) {
  const admins = await db.select().from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'approved')))
    .all();
  const sent = new Set();
  for (const admin of admins) {
    if (sent.has(admin.telegramId)) continue;
    sent.add(admin.telegramId);
    try { await api.sendMessage({ chat_id: admin.telegramId, text }); }
    catch { console.warn('Could not notify an admin about a bot event.'); }
  }
}

async function registerUser(message) {
  const tgUser = message.from;
  if (!tgUser || !Number.isSafeInteger(tgUser.id) || tgUser.is_bot) return null;
  const isBootstrapAdmin = ADMIN_TELEGRAM_IDS.includes(tgUser.id);
  let user = await db.select().from(users).where(eq(users.telegramId, tgUser.id)).get();
  let created = false;
  const profile = {
    telegramId: tgUser.id,
    username: tgUser.username ?? null,
    firstName: textOf(tgUser.first_name) || 'Telegram user',
  };
  if (!user) {
    const result = await db.insert(users).values({
      ...profile,
      role: isBootstrapAdmin ? 'admin' : 'client',
      status: isBootstrapAdmin ? 'approved' : 'pending',
      ...(isBootstrapAdmin ? { approvedAt: new Date() } : {}),
    }).onConflictDoNothing({ target: users.telegramId }).run();
    created = result.rowsAffected > 0;
    user = await db.select().from(users).where(eq(users.telegramId, tgUser.id)).get();
  }
  if (!user) throw new Error('Registration could not be completed.');
  if (isBootstrapAdmin && (user.role !== 'admin' || user.status !== 'approved')) {
    await db.update(users).set({ ...profile, role: 'admin', status: 'approved', approvedAt: user.approvedAt ?? new Date() })
      .where(eq(users.id, user.id)).run();
    user = await db.select().from(users).where(eq(users.id, user.id)).get();
  } else if (user.username !== profile.username || user.firstName !== profile.firstName) {
    await db.update(users).set(profile).where(eq(users.id, user.id)).run();
    user = { ...user, ...profile };
  }
  return { user, created };
}

async function onboard(message) {
  const result = await registerUser(message);
  if (!result) return;
  const { user, created } = result;
  if (user.role === 'admin' && user.status === 'approved') {
    await sendText(message.chat.id, 'Admin အဖြစ် ဝင်ရောက်ပြီးပါပြီ။ /help ဖြင့် command များကို ကြည့်ပါ။');
    return;
  }
  if (user.status === 'approved') {
    await sendText(message.chat.id, `မင်္ဂလာပါ ${user.firstName}။ သင့်အကောင့်ကို အတည်ပြုပြီးပါပြီ။ /help ဖြင့် အသုံးပြုပုံကို ကြည့်ပါ။`);
    return;
  }
  if (user.status === 'rejected') {
    await sendText(message.chat.id, 'သင့် access request ကို အတည်မပြုရသေးပါ။ Admin ထံ ဆက်သွယ်ပါ။');
    return;
  }
  await sendText(message.chat.id, 'အသုံးပြုခွင့်တောင်းဆိုမှု လက်ခံရရှိပါပြီ။ Admin အတည်ပြုပြီးနောက် ပြန်လည်အသိပေးပါမည်။');
  if (created) await sendAdmins(`Client access request\nName: ${user.firstName}\nUsername: ${user.username ? `@${user.username}` : '—'}\nTelegram ID: ${user.telegramId}\nUse /users to review.`);
}

async function requirePrivateAdmin(message) {
  if (message.chat?.type !== 'private') {
    await sendText(message.chat.id, 'Admin command များကို bot နဲ့ private chat မှာပဲ အသုံးပြုပါ။');
    return null;
  }
  const actor = await getApprovedAdmin(message.from.id);
  if (!actor) {
    await sendText(message.chat.id, 'Admin эрх зөвшөөрөгдөөгүй байна။ သတ်မှတ်ထားသော Telegram ID ဖြင့် /start ကိုနှိပ်ပါ။');
    return null;
  }
  return actor;
}

async function showHelp(chatId, isAdmin = false) {
  const lines = [
    'Client bot commands',
    '/start — စာရင်းသွင်းရန် သို့မဟုတ် access စစ်ဆေးရန်',
    '/help — အကူအညီ',
  ];
  if (isAdmin) lines.push(
    '',
    'Admin commands (private chat only)',
    '/users — pending request များကို တစ်ခုချင်း review လုပ်ရန်',
    '/user <Telegram ID သို့မဟုတ် DB ID> — profile ကြည့်ရန်',
    '/approve <Telegram ID သို့မဟုတ် DB ID> — client access ခွင့်ပြုရန်',
    '/reject <Telegram ID သို့မဟုတ် DB ID> — client access ကို ပိတ်ရန်',
    '/broadcast <message> — approved client အားလုံးထံပို့ရန်',
    '/sendto <Telegram ID> <message> — approved client တစ်ဦးထံပို့ရန်',
    '/newtab <client Telegram ID> | <campaign> | <channel> [| <start YYYY-MM-DD>]',
    '/tabs — active campaign များကြည့်ရန်',
    '/addchannel <campaign ID> | <channel> | <HTTPS URL or ->',
    '/addpost <campaign ID> | <channel ID> | <https://t.me/...>',
    '/budget <campaign ID> <amount Ks>',
    '/endtab <campaign ID> — campaign ပြီးဆုံးစေရန်',
    '/report <campaign ID သို့မဟုတ် အမည်> — report ကြည့်/ပို့ရန်',
    '/remindnow — ယနေ့ post မရှိသေးသော channel များအကြောင်း admin များထံ သတိပေးရန်',
  );
  await sendText(chatId, lines.join('\n'));
}

async function handleUserCommands(message, command) {
  const actor = await requirePrivateAdmin(message);
  if (!actor) return true;
  const { name, args } = command;
  if (name === 'approve' || name === 'reject') {
    const id = Number(args);
    if (!Number.isSafeInteger(id) || id <= 0) {
      await sendText(message.chat.id, `အသုံးပြုပုံ: /${name} <Telegram ID သို့မဟုတ် DB ID>`);
      return true;
    }
    const target = await findUserByEitherId(id);
    if (!target || target.role !== 'client') {
      await sendText(message.chat.id, 'Client ကို မတွေ့ပါ။');
      return true;
    }
    const approved = name === 'approve';
    await db.update(users)
      .set({ status: approved ? 'approved' : 'rejected', approvedAt: approved ? new Date() : null })
      .where(eq(users.id, target.id)).run();
    try {
      await api.sendMessage({
        chat_id: target.telegramId,
        text: approved ? 'သင့် access request ကို အတည်ပြုပြီးပါပြီ။ Bot အသုံးပြုရန် /help နှိပ်ပါ။' : 'သင့် client access ကို ပိတ်လိုက်ပါပြီ။ Admin ထံ ဆက်သွယ်ပါ။',
      });
    } catch { console.warn('Could not notify the client about a direct status change.'); }
    await sendText(message.chat.id, `${target.firstName} (${target.telegramId}) — ${approved ? 'client ကို အတည်ပြုပြီးပါပြီ။' : 'client access ကို ပိတ်ပြီးပါပြီ။'}`);
    return true;
  }
  if (name === 'users') {
    await sendPendingCard(message.chat.id);
    return true;
  }
  if (name === 'user') {
    const id = Number(args);
    if (!Number.isSafeInteger(id) || id <= 0) {
      await sendText(message.chat.id, 'အသုံးပြုပုံ: /user <Telegram ID သို့မဟုတ် DB ID>');
      return true;
    }
    const user = await findUserByEitherId(id);
    if (!user) await sendText(message.chat.id, 'အသုံးပြုသူကို မတွေ့ပါ။');
    else await api.sendMessage({
      chat_id: message.chat.id,
      text: userDetail(user),
      ...(user.status === 'pending' ? { reply_markup: adminKeyboard(user.id) } : {}),
    });
    return true;
  }
  if (name === 'broadcast') {
    if (!args) { await sendText(message.chat.id, 'အသုံးပြုပုံ: /broadcast <message>'); return true; }
    if (args.length > 3_800) { await sendText(message.chat.id, 'Broadcast စာသားကို စာလုံးရေ 3,800 ထက်တိုအောင် ထည့်ပါ။'); return true; }
    const clients = await db.select().from(users)
      .where(and(eq(users.role, 'client'), eq(users.status, 'approved')))
      .orderBy(asc(users.id)).all();
    let ok = 0; let failed = 0;
    for (const client of clients) {
      try { await api.sendMessage({ chat_id: client.telegramId, text: args }); ok += 1; }
      catch { failed += 1; }
    }
    await sendText(message.chat.id, `Broadcast ပြီးပါပြီ။ အောင်မြင်: ${ok} · မအောင်မြင်: ${failed} · စုစုပေါင်း: ${clients.length}`);
    return true;
  }
  if (name === 'sendto') {
    const match = args.match(/^(\d+)\s+([\s\S]+)$/);
    if (!match) { await sendText(message.chat.id, 'အသုံးပြုပုံ: /sendto <Telegram ID> <message>'); return true; }
    const telegramId = Number(match[1]);
    const client = Number.isSafeInteger(telegramId) ? await db.select().from(users)
      .where(and(eq(users.telegramId, telegramId), eq(users.role, 'client'), eq(users.status, 'approved'))).get() : null;
    if (!client) await sendText(message.chat.id, 'အတည်ပြုပြီးသော client ကို မတွေ့ပါ။');
    else {
      try {
        await api.sendMessage({ chat_id: client.telegramId, text: match[2] });
        await sendText(message.chat.id, `${client.firstName} (${client.telegramId}) ထံ message ပို့ပြီးပါပြီ။`);
      } catch { await sendText(message.chat.id, 'Message မပို့နိုင်ပါ။ အသုံးပြုသူက bot ကို စတင်ထားခြင်းရှိမရှိ စစ်ဆေးပါ။'); }
    }
    return true;
  }
  return false;
}

function parsePipeArgs(args, expectedMin, expectedMax) {
  const parts = args.split('|').map((part) => part.trim());
  return parts.length >= expectedMin && parts.length <= expectedMax && parts.every(Boolean) ? parts : null;
}

async function getCampaignNameMatches(name) {
  const rows = await db.select().from(campaigns).where(eq(campaigns.name, name)).all();
  return rows;
}

async function createCampaign(message, args) {
  const parts = parsePipeArgs(args, 3, 4);
  if (!parts) {
    await sendText(message.chat.id, 'အသုံးပြုပုံ: /newtab <client Telegram ID> | <campaign အမည်> | <channel အမည်> | <စတင်ရက် YYYY-MM-DD, မဖြည့်လည်းရ>');
    return;
  }
  const [clientIdText, campaignName, channelName, startText] = parts.length === 4 ? parts : [parts[0], parts[1], parts[2], ''];
  const clientTelegramId = Number(clientIdText);
  if (!Number.isSafeInteger(clientTelegramId) || clientTelegramId <= 0 || campaignName.length > 100 || channelName.length > 100) {
    await sendText(message.chat.id, 'Client ID သို့မဟုတ် campaign/channel အမည် မမှန်ပါ။'); return;
  }
  const client = await db.select().from(users)
    .where(and(eq(users.telegramId, clientTelegramId), eq(users.role, 'client'), eq(users.status, 'approved'))).get();
  if (!client) { await sendText(message.chat.id, 'ဤ Telegram ID ဖြင့် အတည်ပြုပြီးသော client မတွေ့ပါ။'); return; }
  const startKey = startText || myanmarDateKey();
  const earliestStart = myanmarDateKey(new Date(Date.now() - 29 * DAY_MS));
  if (!isValidDateKey(startKey) || startKey > myanmarDateKey() || startKey < earliestStart) {
    await sendText(message.chat.id, 'စတင်ရက်သည် လွန်ခဲ့သော ၂၉ ရက်မှ ယနေ့အတွင်း YYYY-MM-DD ပုံစံဖြစ်ရမည်။'); return;
  }
  const startsAt = myanmarMidnight(startKey);
  const endsAt = new Date(startsAt.getTime() + 30 * DAY_MS - 1_000);
  const [campaign] = await db.insert(campaigns).values({
    clientId: client.id,
    name: campaignName,
    startsAt,
    endsAt,
    usedBudgetKs: 0,
    status: 'active',
  }).returning().run();
  let channel;
  try {
    [channel] = await db.insert(campaignChannels).values({
      campaignId: campaign.id,
      channelName,
      channelUrl: null,
    }).returning().run();
  } catch (error) {
    await db.delete(campaignChannels).where(eq(campaignChannels.campaignId, campaign.id)).run();
    await db.delete(campaigns).where(eq(campaigns.id, campaign.id)).run();
    throw error;
  }
  await sendText(message.chat.id, `Campaign ဖန်တီးပြီးပါပြီ။\nID: ${campaign.id}\nClient: ${client.firstName} (${client.telegramId})\nChannel ID: ${channel.id}\n${startKey} မှ ${displayDate(endsAt)} အထိ`);
}

async function listCampaigns(chatId) {
  const now = new Date();
  const rows = await db.select().from(campaigns)
    .where(and(eq(campaigns.status, 'active'), lte(campaigns.startsAt, now), gte(campaigns.endsAt, now)))
    .orderBy(asc(campaigns.startsAt)).all();
  if (rows.length === 0) { await sendText(chatId, 'လက်ရှိ active campaign မရှိပါ။'); return; }
  const lines = ['Active campaigns'];
  for (const campaign of rows) {
    const client = await db.select().from(users).where(eq(users.id, campaign.clientId)).get();
    const channels = await db.select().from(campaignChannels).where(eq(campaignChannels.campaignId, campaign.id)).orderBy(asc(campaignChannels.id)).all();
    const todayRecords = await db.select().from(postRecords).where(and(eq(postRecords.campaignId, campaign.id), eq(postRecords.postedOn, myanmarDateKey()))).all();
    lines.push(`#${campaign.id} ${campaign.name} — ${client?.firstName ?? 'unknown client'} (${client?.telegramId ?? '—'})`);
    lines.push(`  ${displayDate(campaign.startsAt)}–${displayDate(campaign.endsAt)} · ${campaign.usedBudgetKs} Ks · ${todayRecords.length}/${channels.length} channels posted`);
    for (const channel of channels) lines.push(`  channel ${channel.id}: ${channel.channelName}${channel.channelUrl ? ` — ${channel.channelUrl}` : ''}`);
  }
  await sendText(chatId, lines.join('\n'));
}

async function addChannel(message, args) {
  const parts = parsePipeArgs(args, 3, 3);
  if (!parts) { await sendText(message.chat.id, 'အသုံးပြုပုံ: /addchannel <campaign ID> | <channel အမည်> | <channel URL, မရှိလျှင် ->'); return; }
  const campaignId = Number(parts[0]);
  const channelName = parts[1];
  const channelUrl = parts[2] === '-' ? null : parts[2];
  if (!Number.isSafeInteger(campaignId) || campaignId <= 0 || channelName.length > 100 || (channelUrl && !/^https:\/\//i.test(channelUrl))) {
    await sendText(message.chat.id, 'Campaign ID, channel အမည် သို့မဟုတ် HTTPS URL မမှန်ပါ။ URL မရှိလျှင် `-` ထည့်ပါ။'); return;
  }
  const campaign = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign) { await sendText(message.chat.id, 'Campaign ကို မတွေ့ပါ။'); return; }
  const [channel] = await db.insert(campaignChannels).values({ campaignId, channelName, channelUrl }).returning().run();
  await sendText(message.chat.id, `Channel ထည့်ပြီးပါပြီ။ ID: ${channel.id} · ${channel.channelName}`);
}

async function addPost(message, args) {
  await pruneExpiredPostRecords();
  const parts = parsePipeArgs(args, 3, 3);
  if (!parts) { await sendText(message.chat.id, 'အသုံးပြုပုံ: /addpost <campaign ID> | <channel ID> | <https://t.me/... post link>'); return; }
  const [campaignSelector, channelSelector, postUrl] = parts;
  const campaignId = Number(campaignSelector);
  let campaign;
  if (Number.isSafeInteger(campaignId) && campaignId > 0) campaign = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  else {
    const matches = await getCampaignNameMatches(campaignSelector);
    if (matches.length > 1) { await sendText(message.chat.id, 'အမည်တူ campaign များရှိသည်။ Campaign ID ကို အသုံးပြုပါ။'); return; }
    campaign = matches[0] ?? null;
  }
  if (!campaign) { await sendText(message.chat.id, 'Campaign ကို မတွေ့ပါ။'); return; }
  const channelId = Number(channelSelector);
  let channel;
  if (Number.isSafeInteger(channelId) && channelId > 0) channel = await db.select().from(campaignChannels)
    .where(and(eq(campaignChannels.id, channelId), eq(campaignChannels.campaignId, campaign.id))).get();
  else channel = await db.select().from(campaignChannels)
    .where(and(eq(campaignChannels.campaignId, campaign.id), eq(campaignChannels.channelName, channelSelector))).get();
  if (!channel) { await sendText(message.chat.id, 'ဤအမည်ရှိ channel ကို campaign ထဲတွင် မတွေ့ပါ။'); return; }
  const result = await saveDailyPostRecord({ campaignId: campaign.id, channelId: channel.id, postedOn: myanmarDateKey(), postUrl });
  await sendText(message.chat.id, `Post ${result.replaced ? 'ပြင်ဆင်ပြီးပါပြီ' : 'မှတ်တမ်းတင်ပြီးပါပြီ'}: ${campaign.name} · ${channel.channelName} · ${result.postedOn}\n${result.postUrl}`);
}

async function updateBudget(message, args) {
  const match = args.match(/^(\d+)\s+(\d+)$/);
  if (!match) { await sendText(message.chat.id, 'အသုံးပြုပုံ: /budget <campaign ID> <အသုံးပြုထားသော budget Ks>'); return; }
  const campaignId = Number(match[1]);
  const amount = Number(match[2]);
  if (!Number.isSafeInteger(campaignId) || campaignId <= 0 || !Number.isSafeInteger(amount) || amount < 0) {
    await sendText(message.chat.id, 'ID နှင့် budget သည် 0 သို့မဟုတ် ၎င်းထက်ကြီးသော ကိန်းပြည့်ဖြစ်ရမည်။'); return;
  }
  const result = await db.update(campaigns).set({ usedBudgetKs: amount })
    .where(eq(campaigns.id, campaignId)).run();
  await sendText(message.chat.id, result.rowsAffected ? `Campaign #${campaignId} ၏ budget ကို ${amount.toLocaleString('en-US')} Ks သို့ သတ်မှတ်ပြီးပါပြီ.` : 'Campaign ကို မတွေ့ပါ။');
}

async function endCampaign(message, args) {
  const campaignId = Number(args);
  if (!Number.isSafeInteger(campaignId) || campaignId <= 0) { await sendText(message.chat.id, 'အသုံးပြုပုံ: /endtab <campaign ID>'); return; }
  const now = new Date();
  const result = await db.update(campaigns).set({ status: 'completed', endsAt: now })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, 'active'))).run();
  await sendText(message.chat.id, result.rowsAffected ? `Campaign #${campaignId} ပြီးဆုံးကာ history ထဲသို့ ပြောင်းရွှေ့ပြီးပါပြီ။` : 'Active campaign ကို မတွေ့ပါ။');
}

async function campaignByNameOrId(value) {
  const id = Number(value);
  if (Number.isSafeInteger(id) && id > 0) return db.select().from(campaigns).where(eq(campaigns.id, id)).get();
  const normalize = (name) => name.toLowerCase().replace(/[\s_-]+/g, '');
  const target = normalize(value);
  const rows = await db.select().from(campaigns).all();
  const matches = rows.filter((campaign) => normalize(campaign.name) === target);
  return matches.length === 1 ? matches[0] : null;
}

function reportKeyboard(campaignId) {
  return { inline_keyboard: [[{ text: '📤 Send to client', callback_data: `r:s:${campaignId}` }]] };
}

async function viewReport(chatId, selector) {
  await pruneExpiredPostRecords();
  if (!selector) { await sendText(chatId, 'အသုံးပြုပုံ: /report <campaign ID သို့မဟုတ် အမည်>'); return; }
  const campaign = await campaignByNameOrId(selector);
  if (!campaign) { await sendText(chatId, 'Campaign ကို မတွေ့ပါ သို့မဟုတ် အမည်တူနေပါသည်။ ID ကို အသုံးပြုပါ။'); return; }
  const channels = await db.select().from(campaignChannels).where(eq(campaignChannels.campaignId, campaign.id)).all();
  const records = await db.select().from(postRecords)
    .where(eq(postRecords.campaignId, campaign.id)).orderBy(asc(postRecords.postedOn), asc(postRecords.id)).all();
  const channelById = new Map(channels.map((channel) => [channel.id, channel.channelName]));
  const lines = [`Report: ${campaign.name} (#${campaign.id})`, `Period: ${displayDate(campaign.startsAt)} – ${displayDate(campaign.endsAt)}`, 'Date | Channel | Post link'];
  for (const record of records) lines.push(`${record.postedOn} | ${channelById.get(record.channelId) ?? 'Channel'} | ${record.postUrl}`);
  if (records.length === 0) lines.push('Post record မရှိသေးပါ။');
  const chunks = chunksByLines(lines.join('\n'));
  for (let i = 0; i < chunks.length; i += 1) {
    await api.sendMessage({
      chat_id: chatId,
      text: chunks[i],
      ...(i === chunks.length - 1 ? { reply_markup: reportKeyboard(campaign.id) } : {}),
    });
  }
}

async function chooseReportClient(chatId, campaignId, messageId = null) {
  const campaign = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign) {
    if (messageId) await api.editMessageText({ chat_id: chatId, message_id: messageId, text: 'Campaign ကို မတွေ့ပါ။', reply_markup: { inline_keyboard: [] } });
    else await sendText(chatId, 'Campaign ကို မတွေ့ပါ။');
    return;
  }
  const client = await db.select().from(users)
    .where(and(eq(users.id, campaign.clientId), eq(users.role, 'client'), eq(users.status, 'approved'))).get();
  if (!client) {
    if (messageId) await api.editMessageText({ chat_id: chatId, message_id: messageId, text: 'Campaign ပိုင်ရှင်သည် လက်ရှိ approved client မဟုတ်ပါ။', reply_markup: { inline_keyboard: [] } });
    else await sendText(chatId, 'Campaign ပိုင်ရှင်သည် လက်ရှိ approved client မဟုတ်ပါ။');
    return;
  }
  const keyboard = [[{
    text: `${client.firstName} · ${client.telegramId}`.slice(0, 60),
    callback_data: `r:c:${campaignId}:${client.id}`,
  }]];
  const text = `Campaign #${campaignId} report ကို ပိုင်ရှင် client ${client.firstName} ထံ ပို့ရန် ရွေးပါ။`;
  if (messageId) await api.editMessageText({ chat_id: chatId, message_id: messageId, text, reply_markup: { inline_keyboard: keyboard } });
  else await api.sendMessage({ chat_id: chatId, text, reply_markup: { inline_keyboard: keyboard } });
}

async function markReportDaysSent(clientId, campaignId, days) {
  const now = new Date();
  const values = days.map((postedOn) => ({ clientId, campaignId, postedOn, sentAt: now, succeeded: true }));
  await db.insert(reportDeliveries).values(values)
    .onConflictDoUpdate({
      target: [reportDeliveries.clientId, reportDeliveries.campaignId, reportDeliveries.postedOn],
      set: { sentAt: now, succeeded: true },
    }).run();
}

async function deliverUnsentReport(adminChatId, campaignId, clientRow) {
  const campaign = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign) { await sendText(adminChatId, 'Campaign ကို မတွေ့ပါ။'); return; }
  if (campaign.clientId !== clientRow.id) { await sendText(adminChatId, 'ဤ campaign ပိုင်ရှင်မဟုတ်သော client ထံ report ပို့၍မရပါ။'); return; }
  const today = myanmarDateKey();
  const records = await db.select().from(postRecords)
    .where(and(eq(postRecords.campaignId, campaignId), lte(postRecords.postedOn, today)))
    .orderBy(asc(postRecords.postedOn), asc(postRecords.id)).all();
  const sentRows = await db.select().from(reportDeliveries)
    .where(and(eq(reportDeliveries.clientId, clientRow.id), eq(reportDeliveries.campaignId, campaignId), eq(reportDeliveries.succeeded, true)))
    .all();
  const sentDates = new Set(sentRows.map((row) => row.postedOn));
  const channelRows = await db.select().from(campaignChannels).where(eq(campaignChannels.campaignId, campaignId)).all();
  const channelById = new Map(channelRows.map((channel) => [channel.id, channel.channelName]));
  const byDate = new Map();
  for (const record of records) {
    if (sentDates.has(record.postedOn)) continue;
    if (!byDate.has(record.postedOn)) byDate.set(record.postedOn, []);
    byDate.get(record.postedOn).push(`${record.postedOn} | ${channelById.get(record.channelId) ?? 'Channel'} | ${record.postUrl}`);
  }
  if (byDate.size === 0) { await sendText(adminChatId, 'မပို့ရသေးသော post အသစ်မရှိပါ။'); return; }
  let dayCount = 0;
  for (const [date, lines] of byDate) {
    const text = [`${campaign.name} — post အသစ်၏ report`, ...lines].join('\n');
    const chunks = chunksByLines(text);
    for (const chunk of chunks) await api.sendMessage({ chat_id: clientRow.telegramId, text: chunk });
    await markReportDaysSent(clientRow.id, campaign.id, [date]);
    dayCount += 1;
  }
  await sendText(adminChatId, `${clientRow.firstName} ထံ မပို့ရသေးသော ${dayCount} ရက်စာ report ပို့ပြီးပါပြီ။ ယခင်ပို့ထားသောရက်များကို ကျော်ထားသည်။`);
}

async function missingPostsToday() {
  const today = myanmarDateKey();
  const now = new Date();
  const active = await db.select().from(campaigns)
    .where(and(eq(campaigns.status, 'active'), lte(campaigns.startsAt, now), gte(campaigns.endsAt, now)))
    .orderBy(asc(campaigns.startsAt)).all();
  const missing = [];
  for (const campaign of active) {
    const channels = await db.select().from(campaignChannels).where(eq(campaignChannels.campaignId, campaign.id)).orderBy(asc(campaignChannels.id)).all();
    for (const channel of channels) {
      const record = await db.select().from(postRecords)
        .where(and(eq(postRecords.channelId, channel.id), eq(postRecords.postedOn, today))).get();
      if (!record) missing.push({ campaign, channel });
    }
  }
  return missing;
}

async function remindAdmins(chatId) {
  const missing = await missingPostsToday();
  if (missing.length === 0) {
    await sendAdmins(`Daily post reminder (${myanmarDateKey()}): active campaign များရှိ channel များ အားလုံး post record ထည့်ပြီးပါပြီ။`);
    await sendText(chatId, 'ယနေ့ active campaign များရှိ channel အားလုံးအတွက် post link မှတ်တမ်းရှိပါသည်။');
    return;
  }
  const lines = [`Daily post reminder (${myanmarDateKey()}) — ${missing.length} missing channel`];
  for (const item of missing) lines.push(`#${item.campaign.id} ${item.campaign.name} · ${item.channel.channelName}`);
  await sendAdmins(lines.join('\n'));
  await sendText(chatId, `Admin များထံ reminder ပို့ပြီးပါပြီ။ Post မရှိသော channel: ${missing.length} ခု။`);
}

async function handleCampaignCommands(message, command) {
  const actor = await requirePrivateAdmin(message);
  if (!actor) return true;
  const { name, args } = command;
  if (name === 'newtab') { await createCampaign(message, args); return true; }
  if (name === 'tabs' || name === 'campaigns') { await listCampaigns(message.chat.id); return true; }
  if (name === 'addchannel') { await addChannel(message, args); return true; }
  if (name === 'addpost') { await addPost(message, args); return true; }
  if (name === 'budget') { await updateBudget(message, args); return true; }
  if (name === 'endtab') { await endCampaign(message, args); return true; }
  if (name === 'report') { await viewReport(message.chat.id, args); return true; }
  if (name === 'remindnow') { await remindAdmins(message.chat.id); return true; }
  return false;
}

export async function handleBotMessage(message) {
  if (!message?.from || message.from.is_bot) return;
  const text = textOf(message.text);
  const command = commandParts(text);
  if (!command) return;
  if (message.chat?.type !== 'private') {
    if (command.name === 'start') await sendText(message.chat.id, 'Bot ကို private chat မှာဖွင့်ပြီး /start နှိပ်ပါ။');
    else await sendText(message.chat.id, 'Bot command များကို private chat မှာပဲ အသုံးပြုပါ။');
    return;
  }
  try {
    if (command.name === 'start') { await onboard(message); return; }
    if (command.name === 'help') {
      const admin = await getApprovedAdmin(message.from.id);
      const user = await db.select().from(users).where(eq(users.telegramId, message.from.id)).get();
      await showHelp(message.chat.id, Boolean(admin));
      if (user?.status === 'pending') await sendText(message.chat.id, 'သင့် access request သည် admin စစ်ဆေးမှုကို စောင့်နေပါသည်။');
      return;
    }
    const adminCommands = new Set(['users', 'user', 'approve', 'reject', 'broadcast', 'sendto', 'newtab', 'tabs', 'campaigns', 'addchannel', 'addpost', 'budget', 'endtab', 'report', 'remindnow']);
    if (adminCommands.has(command.name)) {
      if (await handleUserCommands(message, command)) return;
      await handleCampaignCommands(message, command);
      return;
    }
    // Preserve the guide's /<campaign-name> shorthand, while /report <name|id> is
    // recommended when a campaign has spaces or names overlap with bot commands.
    const selector = text.replace(/^\//, '').replace(/@[A-Za-z0-9_]+(?=\s|$)/, '').trim();
    if (selector) {
      const campaign = await campaignByNameOrId(selector);
      if (campaign) {
        if (!await requirePrivateAdmin(message)) return;
        await viewReport(message.chat.id, selector);
      }
    }
  } catch {
    console.error('Bot command failed.');
    try { await sendText(message.chat.id, 'Command လုပ်ဆောင်ရာတွင် အမှားရှိပါသည်။ ထည့်သွင်းချက်ကို စစ်ဆေးပြီး ထပ်ကြိုးစားပါ။'); }
    catch { console.warn('Could not send bot error reply.'); }
  }
}

export async function handleBotCallback(callback) {
  const data = textOf(callback?.data);
  const chatId = callback?.message?.chat?.id;
  const messageId = callback?.message?.message_id;
  let notice = 'ပြီးပါပြီ။';
  let alert = false;
  try {
    if (!callback?.from || !chatId || !messageId || !data) { notice = 'ဤခလုတ် သက်တမ်းမရှိတော့ပါ။'; alert = true; return; }
    if (callback.message.chat.type !== 'private') { notice = 'Private chat မှာ အသုံးပြုပါ။'; alert = true; return; }
    const admin = await getApprovedAdmin(callback.from.id);
    if (!admin) { notice = 'အတည်ပြုထားသော admin လိုအပ်ပါသည်။'; alert = true; return; }
    const parts = data.split(':');
    if (parts[0] === 'u') {
      const action = parts[1];
      const value = Number(parts[2]);
      if (action === 'p' && Number.isSafeInteger(value)) {
        await sendPendingCard(chatId, value, messageId);
      } else if ((action === 'a' || action === 'r') && Number.isSafeInteger(value) && value > 0) {
        const target = await db.select().from(users).where(and(eq(users.id, value), eq(users.status, 'pending'))).get();
        if (!target) { notice = 'ဤ request ကို ဆုံးဖြတ်ပြီးဖြစ်သည် သို့မဟုတ် မတွေ့ပါ။'; alert = true; }
        else {
          const approved = action === 'a';
          const result = await db.update(users)
            .set({ status: approved ? 'approved' : 'rejected', approvedAt: approved ? new Date() : null })
            .where(and(eq(users.id, value), eq(users.status, 'pending'))).run();
          if (!result.rowsAffected) { notice = 'Request ကို ဆုံးဖြတ်ပြီးဖြစ်သည်။'; alert = true; }
          else {
            try { await api.sendMessage({ chat_id: target.telegramId, text: approved ? 'သင့် access request ကို အတည်ပြုပြီးပါပြီ။ Bot အသုံးပြုရန် /help နှိပ်ပါ။' : 'သင့် access request ကို ယခုအချိန်တွင် အတည်မပြုပါ။ Admin ထံ ဆက်သွယ်ပါ။' }); }
            catch { console.warn('Could not notify the reviewed user.'); }
            notice = approved ? 'Client ကို အတည်ပြုပြီးပါပြီ။' : 'Request ကို ငြင်းပယ်ပြီးပါပြီ။';
            await sendPendingCard(chatId, 0, messageId);
          }
        }
      } else { notice = 'ခလုတ်အချက်အလက် မမှန်ပါ။'; alert = true; }
    } else if (parts[0] === 'r') {
      const action = parts[1];
      const campaignId = Number(parts[2]);
      if (!Number.isSafeInteger(campaignId) || campaignId <= 0) { notice = 'Campaign ကို မတွေ့ပါ။'; alert = true; }
      else if (action === 's') await chooseReportClient(chatId, campaignId, messageId);
      else if (action === 'c') {
        const userId = Number(parts[3]);
        const client = Number.isSafeInteger(userId) ? await db.select().from(users)
          .where(and(eq(users.id, userId), eq(users.role, 'client'), eq(users.status, 'approved'))).get() : null;
        if (!client) { notice = 'အတည်ပြုပြီးသော client ကို မတွေ့ပါ။'; alert = true; }
        else await deliverUnsentReport(chatId, campaignId, client);
      } else { notice = 'ခလုတ်အချက်အလက် မမှန်ပါ။'; alert = true; }
    } else { notice = 'မသိသောခလုတ်ဖြစ်ပါသည်။'; alert = true; }
  } catch {
    console.error('Bot callback failed.');
    notice = 'လုပ်ဆောင်ချက် မအောင်မြင်ပါ။ ထပ်ကြိုးစားပါ။';
    alert = true;
  } finally {
    try { await api.answerCallbackQuery({ callback_query_id: callback.id, text: notice, show_alert: alert }); }
    catch { console.warn('Could not answer a bot callback.'); }
  }
}
