/**
 * bot.js — Telegraf бот
 * Команды управления и отправка отчётов в группу.
 *
 * /start      — приветствие
 * /chatid     — ID текущего чата
 * /members    — список команды
 * /add        — добавить участника
 * /remove     — удалить участника
 * /lastreport — последний отчёт
 * /testreport — тестовый отчёт
 */

const { Telegraf } = require('telegraf');
const { getLastSession, getSessionsByMonth, getIgnored, addIgnored, removeIgnored } = require('./storage');
const { generateReport, generateMonthReport } = require('./reportGenerator');

const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(Number)
  : [];

function createBot() {
  const bot = new Telegraf(process.env.BOT_TOKEN);

  // ─── Middleware: все команды — только для админов ─────────────
  bot.use((ctx, next) => {
    if (ctx.updateType !== 'message' || !ctx.message?.text?.startsWith('/')) {
      return next();
    }
    if (!isAdmin(ctx)) {
      return ctx.reply('⛔ Только для администраторов');
    }
    return next();
  });

  // ─── /start ──────────────────────────────────────────────────
  bot.start((ctx) => {
    ctx.reply(
      '👋 Daily Standup Bot\n\n' +
      'Слежу за видеочатами и автоматически формирую отчёт после каждого стендапа.\n\n' +
      '📋 Отчёты:\n' +
      '/lastreport — отчёт о последнем стендапе\n' +
      '/monthreport — пропуски за текущий месяц\n' +
      '/monthreport 03.2026 — пропуски за конкретный месяц\n\n' +
      '🚫 Игнор-лист:\n' +
      '/ignore <id> <имя> — скрыть пользователя из отчётов\n' +
      '/unignore <id> — убрать из игнор-листа\n' +
      '/ignorelist — список игнорируемых\n\n' +
      '⚙️ Прочее:\n' +
      '/chatid — ID этого чата\n' +
      '/testreport — тестовый отчёт'
    );
  });

  // ─── /chatid ─────────────────────────────────────────────────
  bot.command('chatid', (ctx) => {
    ctx.reply(`Chat ID: ${ctx.chat.id}`);
  });

  // ─── /ignore <userId> <имя> ──────────────────────────────────
  bot.command('ignore', (ctx) => {
    const parts = ctx.message.text.split(' ').slice(1);
    if (parts.length < 1) {
      return ctx.reply('Использование: /ignore <userId> [имя]\nПример: /ignore 123456789 Standup Bot');
    }

    const userId = parseInt(parts[0], 10);
    if (isNaN(userId)) return ctx.reply('❌ Неверный User ID');

    const name = parts.slice(1).join(' ') || `User${userId}`;
    const added = addIgnored(userId, name);
    ctx.reply(added
      ? `✅ Пользователь ${name} (ID: ${userId}) добавлен в игнор-лист`
      : `⚠️ Уже в игнор-листе`
    );
  });

  // ─── /unignore <userId> ───────────────────────────────────────
  bot.command('unignore', (ctx) => {
    const userId = parseInt(ctx.message.text.split(' ')[1], 10);
    if (isNaN(userId)) return ctx.reply('Использование: /unignore <userId>');

    ctx.reply(removeIgnored(userId)
      ? `✅ Пользователь удалён из игнор-листа`
      : `⚠️ Пользователь не найден в игнор-листе`
    );
  });

  // ─── /ignorelist ──────────────────────────────────────────────
  bot.command('ignorelist', (ctx) => {
    const ignored = getIgnored();
    if (ignored.length === 0) return ctx.reply('Игнор-лист пуст');

    const list = ignored
      .map((u, i) => `${i + 1}. ${u.name} — ID: ${u.userId}`)
      .join('\n');
    ctx.reply(`🚫 Игнор-лист (${ignored.length}):\n\n${list}`);
  });

  // ─── /monthreport [MM.YYYY] ───────────────────────────────────
  bot.command('monthreport', (ctx) => {
    const arg = ctx.message.text.split(' ')[1]; // например 03.2026
    let year, month;

    if (arg) {
      const parts = arg.split('.');
      month = parseInt(parts[0], 10);
      year = parseInt(parts[1], 10);
      if (isNaN(month) || isNaN(year) || month < 1 || month > 12) {
        return ctx.reply('Неверный формат. Пример: /monthreport 03.2026');
      }
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    const sessions = getSessionsByMonth(year, month);
    const text = generateMonthReport(sessions, year, month);
    ctx.reply(text, { parse_mode: 'MarkdownV2' });
  });

  // ─── /lastreport ─────────────────────────────────────────────
  bot.command('lastreport', (ctx) => {
    const session = getLastSession();
    if (!session) return ctx.reply('Данных о стендапах пока нет');
    ctx.reply(generateReport(session), { parse_mode: 'MarkdownV2' });
  });

  // ─── /testreport ─────────────────────────────────────────────
  bot.command('testreport', (ctx) => {
    const now = Date.now();
    const fakeSnapshot = {
      callStartTime: now - 22 * 60 * 1000,
      callEndTime: now,
      participants: [
        { userId: 111, name: 'Иван Иванов', username: 'ivan_dev', joinTime: now - 22 * 60 * 1000, leaveTime: now, totalMicMs: 4 * 60 * 1000 },
        { userId: 222, name: 'Мария Петрова', username: null, joinTime: now - 18 * 60 * 1000, leaveTime: now, totalMicMs: 0 },
      ],
      absent: [
        { userId: 333, name: 'Пётр Козлов', username: 'petr_dev' },
      ],
    };
    ctx.reply(generateReport(fakeSnapshot), { parse_mode: 'MarkdownV2' });
  });

  // ─── Отправка отчёта (вызывается из userClient) ──────────────
  async function sendReport(snapshot) {
    try {
      const text = generateReport(snapshot);
      await bot.telegram.sendMessage(snapshot.botChatId, text, { parse_mode: 'MarkdownV2' });
      console.log('[Bot] Отчёт отправлен');
    } catch (err) {
      console.error('[Bot] Ошибка отправки отчёта:', err.message);
    }
  }

  return { bot, sendReport };
}

function isAdmin(ctx) {
  if (ADMIN_IDS.length === 0) return true;
  return ADMIN_IDS.includes(ctx.from?.id);
}

module.exports = { createBot };
