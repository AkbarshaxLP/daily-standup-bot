require('dotenv').config();
const { createBot } = require('./src/bot');
const { startUserClient } = require('./src/userClient');

async function main() {
  const { bot, sendReport } = createBot();

  await startUserClient(sendReport);

  await bot.launch();
  console.log('[Main] Daily Standup Bot запущен');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  console.error('[Main] Критическая ошибка:', err);
  process.exit(1);
});
