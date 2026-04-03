const TIMEZONE = 'Asia/Tashkent';

function formatTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIMEZONE,
  });
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0 сек';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec} сек`;
  if (sec === 0) return `${min} мин`;
  return `${min} мин ${sec} сек`;
}

function generateReport(snapshot) {
  const { callStartTime, callEndTime, participants, absent = [] } = snapshot;

  const sorted = [...participants].sort((a, b) => a.joinTime - b.joinTime);

  const lines = [];
  lines.push(`📋 *Итоги Daily Standup*`);

  const dateStr = new Date(callStartTime).toLocaleDateString('ru-RU', {
    timeZone: TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  lines.push(`📅 ${escapeMarkdown(dateStr)}`);
  lines.push(`🕐 ${formatTime(callStartTime)} – ${formatTime(callEndTime)} \\(${formatDuration(callEndTime - callStartTime)}\\)`);
  lines.push('');

  // ─── Присутствовали ──────────────────────────────────────────
  lines.push(`✅ *Присутствовали* \\(${sorted.length}\\):`);
  if (sorted.length === 0) {
    lines.push('  _никто не зашёл_');
  } else {
    for (const p of sorted) {
      const nameStr = `[${escapeMarkdown(p.name)}](tg://user?id=${p.userId})`;
      const micStr = p.totalMicMs > 0
        ? `🎙 ${formatDuration(p.totalMicMs)}`
        : '🔇 не говорил';
      lines.push(`  • ${nameStr} — ${micStr}`);
    }
  }

  lines.push('');

  // ─── Не пришли ───────────────────────────────────────────────
  lines.push(`❌ *Не пришли* \\(${absent.length}\\):`);
  if (absent.length === 0) {
    lines.push('  _все присутствовали_ 🎉');
  } else {
    for (const m of absent) {
      lines.push(`  • [${escapeMarkdown(m.name)}](tg://user?id=${m.userId})`);
    }
  }

  lines.push('');
  lines.push('_Отчёт сформирован автоматически_');

  return lines.join('\n');
}


function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// Отчёт по пропускам за месяц
// sessions — массив сессий за месяц
function generateMonthReport(sessions, year, month) {
  const monthName = new Date(year, month - 1, 1).toLocaleString('ru-RU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  });

  const lines = [];
  lines.push(`📊 *Отчёт за ${escapeMarkdown(monthName)}*`);
  lines.push(`Всего стендапов: *${sessions.length}*`);
  lines.push('');

  if (sessions.length === 0) {
    lines.push('_Данных за этот месяц нет_');
    return lines.join('\n');
  }

  // Считаем пропуски: userId → { name, count }
  const missMap = new Map();
  for (const session of sessions) {
    for (const absent of session.absent || []) {
      if (!missMap.has(absent.userId)) {
        missMap.set(absent.userId, { name: absent.name, count: 0 });
      }
      missMap.get(absent.userId).count++;
    }
  }

  if (missMap.size === 0) {
    lines.push('🎉 _Никто не пропустил ни одного стендапа\\!_');
    return lines.join('\n');
  }

  // Сортируем по количеству пропусков (по убыванию)
  const sorted = [...missMap.entries()]
    .sort((a, b) => b[1].count - a[1].count);

  lines.push(`❌ *Пропуски:*`);
  for (const [userId, { name, count }] of sorted) {
    const nameStr = `[${escapeMarkdown(name)}](tg://user?id=${userId})`;
    const times = escapeMarkdown(pluralize(count, 'раз', 'раза', 'раз'));
    lines.push(`  • ${nameStr} — ${count} ${times}`);
  }

  return lines.join('\n');
}

function pluralize(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

module.exports = { generateReport, generateMonthReport };
