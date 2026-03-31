/**
 * userClient.js — GramJS MTProto user-client
 *
 * Слушает события группового звонка:
 *   UpdateGroupCall             → звонок начался / завершился
 *   UpdateGroupCallParticipants → участники зашли / вышли / изменили микрофон
 *
 * При старте звонка автоматически загружает список участников группы.
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Raw } = require('telegram/events');
const fs = require('fs');
const path = require('path');

const callTracker = require('./callTracker');
const { saveSession, isIgnored } = require('./storage');

const SESSION_FILE = path.join(__dirname, '..', 'data', 'session.json');

// MTProto передаёт сырой peer ID без знака и без префикса 100.
// Bot API для супергрупп добавляет -100 спереди (например -1001234567890 → 1234567890).
function normalizeChatId(id) {
  const s = String(id).replace('-', '');
  return s.startsWith('100') && s.length >= 12 ? s.slice(3) : s;
}

function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) return '';
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')).session || '';
  } catch {
    return '';
  }
}

function persistSession(sessionString) {
  const dir = path.dirname(SESSION_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ session: sessionString }), 'utf8');
}

let client = null;

async function startUserClient(onReportReady) {
  const sessionString = loadSession();
  if (!sessionString) {
    console.error('[UserClient] Сессия не найдена. Запустите: npm run auth');
    return;
  }

  const apiId = parseInt(process.env.API_ID, 10);
  const apiHash = process.env.API_HASH;
  // Нормализуем ID: убираем знак и префикс 100 (Bot API супергрупп)
  const groupChatId = normalizeChatId(process.env.GROUP_CHAT_ID);
  console.log(`[UserClient] Слежу за чатом: ${process.env.GROUP_CHAT_ID} (normalized: ${groupChatId})`);

  client = new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );

  await client.connect();
  console.log('[UserClient] MTProto клиент подключён');
  persistSession(client.session.save());

  client.addEventHandler(async (update) => {
    try {
      await handleUpdate(update, groupChatId, onReportReady);
    } catch (err) {
      console.error('[UserClient] Ошибка апдейта:', err.message);
    }
  }, new Raw());
}

// Загружает всех участников группы (исключая ботов и игнорируемых)
async function fetchGroupMembers(groupChatId) {
  try {
    const participants = await client.getParticipants(
      parseInt(process.env.GROUP_CHAT_ID, 10)
    );
    const members = [];
    for (const p of participants) {
      if (p.bot) continue;
      if (isIgnored(Number(p.id))) continue;
      members.push({
        userId: Number(p.id),
        name: [p.firstName, p.lastName].filter(Boolean).join(' ') || p.username || `User${p.id}`,
        username: p.username || null,
      });
    }
    console.log(`[UserClient] Загружено участников группы: ${members.length}`);
    return members;
  } catch (err) {
    console.error('[UserClient] Ошибка загрузки участников группы:', err.message);
    return [];
  }
}

async function handleUpdate(update, groupChatId, onReportReady) {
  // ─── Звонок начался / завершился ─────────────────────────────
  if (update.className === 'UpdateGroupCall') {
    const chatId = update.chatId != null ? normalizeChatId(update.chatId) : null;
    console.log(`[UserClient] UpdateGroupCall chatId=${chatId} groupChatId=${groupChatId}`);
    if (chatId && chatId !== groupChatId) return;

    const call = update.call;
    if (!call) return;

    if (call.className === 'GroupCall' && !call.finished) {
      // Загружаем участников группы и стартуем трекинг
      const members = await fetchGroupMembers(groupChatId);
      callTracker.onCallStart(members);
    } else if (call.className === 'GroupCallDiscarded' || call.finished) {
      const snapshot = callTracker.onCallEnd();
      if (snapshot) {
        saveSession(snapshot);
        if (onReportReady) await onReportReady(snapshot);
      }
    }
    return;
  }

  // ─── Изменения участников (вход / выход / микрофон) ──────────
  if (update.className === 'UpdateGroupCallParticipants') {
    if (!callTracker.isActive()) return;

    for (const p of update.participants || []) {
      if (p.className !== 'GroupCallParticipant') continue;

      const peer = p.peer;
      if (peer?.className !== 'PeerUser') continue;

      const userId = Number(peer.userId);
      let firstName = null, lastName = null, username = null;

      try {
        const entity = await client.getEntity(userId);
        firstName = entity.firstName || null;
        lastName = entity.lastName || null;
        username = entity.username || null;
      } catch { /* имя необязательно */ }

      if (isIgnored(userId)) continue;

      callTracker.onParticipantUpdate({
        userId,
        firstName,
        lastName,
        username,
        muted: p.muted ?? true,
        left: p.left ?? false,
      });
    }
  }
}

module.exports = { startUserClient };
