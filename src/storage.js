const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const MEMBERS_FILE = path.join(DATA_DIR, 'members.json');
const IGNORED_FILE = path.join(DATA_DIR, 'ignored.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJSON(filePath, defaultValue = {}) {
  ensureDataDir();
  if (!fs.existsSync(filePath)) return defaultValue;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return defaultValue;
  }
}

function writeJSON(filePath, data) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Участники команды ───────────────────────────────────────────
function getMembers() {
  const data = readJSON(MEMBERS_FILE, { members: [] });
  return data.members || [];
}

function addMember(member) {
  const data = readJSON(MEMBERS_FILE, { members: [] });
  const exists = data.members.find(m => m.telegramId === member.telegramId);
  if (!exists) {
    data.members.push(member);
    writeJSON(MEMBERS_FILE, data);
  }
  return !exists;
}

function removeMember(telegramId) {
  const data = readJSON(MEMBERS_FILE, { members: [] });
  const before = data.members.length;
  data.members = data.members.filter(m => m.telegramId !== telegramId);
  writeJSON(MEMBERS_FILE, data);
  return data.members.length < before;
}

// ─── Сессии стендапов ────────────────────────────────────────────
function getSessions() {
  return readJSON(SESSIONS_FILE, { sessions: [] });
}

function saveSession(session) {
  const data = getSessions();
  data.sessions.push(session);
  // Хранить только последние 30 сессий
  if (data.sessions.length > 30) {
    data.sessions = data.sessions.slice(-30);
  }
  writeJSON(SESSIONS_FILE, data);
}

function getLastSession() {
  const data = getSessions();
  const sessions = data.sessions || [];
  return sessions.length ? sessions[sessions.length - 1] : null;
}

// year и month — числа (например 2026, 3). month: 1-12
function getSessionsByMonth(year, month) {
  const data = getSessions();
  return (data.sessions || []).filter((s) => {
    const d = new Date(s.callStartTime);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });
}

// ─── Игнорируемые пользователи ───────────────────────────────────
// { userId, name } — не попадают в отчёт

function getIgnored() {
  const data = readJSON(IGNORED_FILE, { ignored: [] });
  return data.ignored || [];
}

function addIgnored(userId, name) {
  const data = readJSON(IGNORED_FILE, { ignored: [] });
  const exists = data.ignored.find(u => u.userId === userId);
  if (!exists) {
    data.ignored.push({ userId, name });
    writeJSON(IGNORED_FILE, data);
  }
  return !exists;
}

function removeIgnored(userId) {
  const data = readJSON(IGNORED_FILE, { ignored: [] });
  const before = data.ignored.length;
  data.ignored = data.ignored.filter(u => u.userId !== userId);
  writeJSON(IGNORED_FILE, data);
  return data.ignored.length < before;
}

function isIgnored(userId) {
  return getIgnored().some(u => u.userId === userId);
}

module.exports = {
  getMembers,
  addMember,
  removeMember,
  saveSession,
  getLastSession,
  getSessionsByMonth,
  getIgnored,
  addIgnored,
  removeIgnored,
  isIgnored,
};
