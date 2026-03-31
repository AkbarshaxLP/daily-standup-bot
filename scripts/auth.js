/**
 * Одноразовая авторизация MTProto user-client через QR-код.
 * Запуск: npm run auth
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join(__dirname, '..', 'data', 'session.json');

async function auth() {
  const apiId = parseInt(process.env.API_ID, 10);
  const apiHash = process.env.API_HASH;

  if (!apiId || !apiHash) {
    console.error('Укажите API_ID и API_HASH в .env');
    process.exit(1);
  }

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 3,
  });

  await client.connect();

  console.log('Сканируй QR-код в Telegram: Настройки → Устройства → Привязать устройство\n');

  await client.signInUserWithQrCode(
    { apiId, apiHash },
    {
      onError: (err) => {
        console.error('Ошибка:', err.message);
        return true;
      },
      qrCode: async (code) => {
        const url = `tg://login?token=${code.token.toString('base64url')}`;
        qrcode.generate(url, { small: true });
        console.log('\nОжидаем сканирования...\n');
      },
      password: async (hint) => {
        const input = require('input');
        return input.text(`Пароль 2FA${hint ? ` (подсказка: ${hint})` : ''}: `);
      },
    }
  );

  const dir = path.dirname(SESSION_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ session: client.session.save() }, null, 2));

  console.log('\n✅ Готово! Сессия сохранена в data/session.json');
  await client.disconnect();
  process.exit(0);
}

auth().catch((err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
