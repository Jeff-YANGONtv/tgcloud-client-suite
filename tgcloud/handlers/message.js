import { handleBotMessage } from '../lib/bot-commands.js';

export default async function (message) {
  await handleBotMessage(message);
}
