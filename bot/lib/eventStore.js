const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function serializeEvent(event) {
  return {
    ...event,
    uploads: Array.from(event.uploads.values()).map((upload) => ({
      ...upload,
      votes: Object.fromEntries(Object.entries(upload.votes).map(([key, set]) => [key, Array.from(set)]))
    }))
  };
}

function createUploadRecord(message, attachmentMeta) {
  return {
    messageId: message.id,
    channelId: message.channelId,
    guildId: message.guildId,
    userId: message.author.id,
    username: `${message.author.username}#${message.author.discriminator}`,
    createdAt: message.createdAt?.toISOString?.() || new Date().toISOString(),
    attachments: attachmentMeta,
    votes: {
      approve: new Set(),
      reject: new Set(),
      warn: new Set(),
      remove: new Set()
    }
  };
}

module.exports = function createEventStore(baseDir, logger) {
  const rootDir = baseDir || path.join(__dirname, '..', 'data', 'events');
  ensureDir(rootDir);

  const events = new Map();

  function persist(event) {
    try {
      ensureDir(event.directory);
      const filePath = path.join(event.directory, 'event.json');
      fs.writeFileSync(filePath, JSON.stringify(serializeEvent(event), null, 2));
    } catch (error) {
      logger?.error('Event persist fehlgeschlagen', { error: error.message, event: event.name });
    }
  }

  function startEvent(channelId, payload) {
    if (events.has(channelId)) {
      throw new Error('In diesem Kanal läuft bereits ein Event.');
    }
    const directory = path.join(rootDir, `${channelId}_${payload.name}`);
    const event = {
      name: payload.name,
      channelId,
      guildId: payload.guildId,
      createdBy: payload.createdBy,
      startedAt: new Date().toISOString(),
      endsAt: payload.endsAt,
      maxEntries: payload.maxEntries,
      directory,
      uploads: new Map(),
      stats: {
        uploads: 0,
        flagged: 0,
        votes: 0
      }
    };
    events.set(channelId, event);
    persist(event);
    logger?.info('Event gestartet', { channelId, name: payload.name });
    return event;
  }

  function stopEvent(channelId, reason) {
    const event = events.get(channelId);
    if (!event) return null;
    event.stoppedAt = new Date().toISOString();
    event.stopReason = reason;
    persist(event);
    events.delete(channelId);
    logger?.info('Event gestoppt', { channelId, name: event.name, reason });
    return event;
  }

  function getEvent(channelId) {
    return events.get(channelId) || null;
  }

  function isEventChannel(channelId) {
    return events.has(channelId);
  }

  function registerUpload(message, attachments, meta = {}) {
    const event = events.get(message.channelId);
    if (!event) return null;
    const existing = Array.from(event.uploads.values()).filter((entry) => entry.userId === message.author.id);
    if (event.maxEntries && existing.length >= event.maxEntries) {
      throw new Error('Maximale Anzahl an Uploads für dieses Event erreicht.');
    }
    const record = createUploadRecord(message, attachments);
    record.scan = meta.scan || null;
    if (meta.scan?.flagged) {
      event.stats.flagged += 1;
    }
    event.uploads.set(record.messageId, record);
    event.stats.uploads = event.uploads.size;
    persist(event);
    logger?.info('Event Upload registriert', { channelId: message.channelId, messageId: message.id });
    return record;
  }

  function updateVotes(channelId, messageId, emojiKey, userId, action) {
    const event = events.get(channelId);
    if (!event) return null;
    const record = event.uploads.get(messageId);
    if (!record) return null;
    const votes = record.votes;
    if (!votes[emojiKey]) return null;
    if (action === 'add') {
      votes[emojiKey].add(userId);
      event.stats.votes += 1;
    } else if (action === 'remove') {
      votes[emojiKey].delete(userId);
      event.stats.votes = Math.max(0, event.stats.votes - 1);
    }
    persist(event);
    return record;
  }

  function addVote(channelId, messageId, emojiKey, userId) {
    return updateVotes(channelId, messageId, emojiKey, userId, 'add');
  }

  function removeVote(channelId, messageId, emojiKey, userId) {
    return updateVotes(channelId, messageId, emojiKey, userId, 'remove');
  }

  function listActiveEvents() {
    return Array.from(events.values()).map((event) => ({
      name: event.name,
      channelId: event.channelId,
      guildId: event.guildId,
      startedAt: event.startedAt,
      endsAt: event.endsAt,
      uploads: event.uploads.size,
      votes: event.stats.votes
    }));
  }

  function updateEvent(channelId, updater) {
    const event = events.get(channelId);
    if (!event) return null;
    updater(event);
    persist(event);
    return event;
  }

  return {
    startEvent,
    stopEvent,
    registerUpload,
    addVote,
    removeVote,
    getEvent,
    isEventChannel,
    listActiveEvents,
    updateEvent
  };
};
