/**
 * callTracker.js
 * Отслеживает участников звонка: кто зашёл, когда, и время микрофона.
 */

class CallTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.active = false;
    this.callStartTime = null;
    this.callEndTime = null;
    this.groupMembers = new Map();
    this.participants = new Map();
  }

  onCallStart(groupMembers = []) {
    this.reset();
    this.active = true;
    this.callStartTime = Date.now();
    for (const m of groupMembers) {
      this.groupMembers.set(m.userId, { name: m.name, username: m.username || null });
    }
    console.log(`[CallTracker] Видеочат начался, участников в группе: ${this.groupMembers.size}`);
  }

  onParticipantUpdate({ userId, firstName, lastName, username, muted, left }) {
    if (!this.active) return;

    const name = [firstName, lastName].filter(Boolean).join(' ') || username || `User${userId}`;
    const now = Date.now();

    if (!this.participants.has(userId)) {
      this.participants.set(userId, {
        name,
        username: username || null,
        joinTime: now,
        leaveTime: null,
        micOnAt: muted ? null : now,
        totalMicMs: 0,
      });
      console.log(`[CallTracker] Зашёл: ${name} (muted=${muted})`);
      return;
    }

    const record = this.participants.get(userId);
    if (name !== `User${userId}`) record.name = name;

    if (left) {
      this._closeMic(record, now);
      if (!record.leaveTime) record.leaveTime = now;
      console.log(`[CallTracker] Вышел: ${name}`);
      return;
    }

    if (!muted && record.micOnAt === null) {
      record.micOnAt = now;
      console.log(`[CallTracker] Микрофон ON: ${name}`);
    } else if (muted && record.micOnAt !== null) {
      this._closeMic(record, now);
      console.log(`[CallTracker] Микрофон OFF: ${name}`);
    }
  }

  onCallEnd() {
    if (!this.active) return null;

    const now = Date.now();
    this.callEndTime = now;
    this.active = false;

    for (const record of this.participants.values()) {
      if (!record.leaveTime) record.leaveTime = now;
      this._closeMic(record, now);
    }

    console.log('[CallTracker] Видеочат завершён');
    return this.buildSnapshot();
  }

  buildSnapshot() {
    const participants = [];
    for (const [userId, record] of this.participants.entries()) {
      participants.push({
        userId,
        name: record.name,
        username: record.username,
        joinTime: record.joinTime,
        leaveTime: record.leaveTime,
        totalMicMs: record.totalMicMs,
      });
    }

    const presentIds = new Set(participants.map(p => p.userId));
    const absent = [];
    for (const [userId, member] of this.groupMembers.entries()) {
      if (!presentIds.has(userId)) {
        absent.push({ userId, name: member.name, username: member.username });
      }
    }

    return {
      callStartTime: this.callStartTime,
      callEndTime: this.callEndTime,
      participants,
      absent,
    };
  }

  isActive() {
    return this.active;
  }

  _closeMic(record, now) {
    if (record.micOnAt !== null) {
      record.totalMicMs += now - record.micOnAt;
      record.micOnAt = null;
    }
  }
}

module.exports = new CallTracker();
