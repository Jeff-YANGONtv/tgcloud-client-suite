import { handleBotCallback } from '../lib/bot-commands.js';

export default async function (callbackQuery) {
  await handleBotCallback(callbackQuery);
}
