const fs = require('fs');
const path = require('path');

const STORE_FILENAME = 'flagged.json';

function readFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function writeFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

module.exports = function createFlaggedStore(baseDir, logger) {
  const storeDir = baseDir || path.join(__dirname, '..', 'data');
  const filePath = path.join(storeDir, STORE_FILENAME);
  fs.mkdirSync(storeDir, { recursive: true });

  const index = new Map();

  function loadInitial() {
    const items = readFile(filePath);
    for (const item of items) {
      if (item && item.messageId) {
        index.set(item.messageId, item);
      }
    }
    logger?.info('FlaggedStore geladen', { size: index.size });
  }

  function persist() {
    writeFile(filePath, Array.from(index.values()));
  }

  function upsert(record) {
    if (!record || !record.messageId) return null;
    const merged = {
      ...index.get(record.messageId),
      ...record,
      updatedAt: new Date().toISOString()
    };
    if (!merged.createdAt) {
      merged.createdAt = new Date().toISOString();
    }
    index.set(record.messageId, merged);
    persist();
    return merged;
  }

  function remove(messageId) {
    const existed = index.delete(messageId);
    if (existed) persist();
    return existed;
  }

  loadInitial();

  return {
    upsert,
    remove,
    get: (messageId) => index.get(messageId),
    list: () => Array.from(index.values()),
    size: () => index.size,
    snapshot: () => new Map(index)
  };
};
