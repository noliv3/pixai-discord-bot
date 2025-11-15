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
  const reviewIndex = new Map();

  function indexReview(record) {
    if (!record) return;
    if (record.reviewMessageId) {
      reviewIndex.set(record.reviewMessageId, record.messageId);
    }
  }

  function dropReview(record) {
    if (!record) return;
    if (record.reviewMessageId) {
      const known = reviewIndex.get(record.reviewMessageId);
      if (known === record.messageId) {
        reviewIndex.delete(record.reviewMessageId);
      }
    }
  }

  function loadInitial() {
    const items = readFile(filePath);
    for (const item of items) {
      if (item && item.messageId) {
        index.set(item.messageId, item);
        indexReview(item);
      }
    }
    logger?.info('FlaggedStore geladen', { size: index.size });
  }

  function persist() {
    writeFile(filePath, Array.from(index.values()));
  }

  function upsert(record) {
    if (!record || !record.messageId) return null;
    const previous = index.get(record.messageId) || null;
    const merged = {
      ...previous,
      ...record,
      updatedAt: new Date().toISOString()
    };
    if (!merged.createdAt) {
      merged.createdAt = new Date().toISOString();
    }
    index.set(record.messageId, merged);
    if (previous) {
      dropReview(previous);
    }
    indexReview(merged);
    persist();
    return merged;
  }

  function remove(messageId) {
    const existing = index.get(messageId);
    if (!existing) return false;
    index.delete(messageId);
    dropReview(existing);
    persist();
    return true;
  }

  loadInitial();

  return {
    upsert,
    remove,
    get: (messageId) => index.get(messageId),
    list: () => Array.from(index.values()),
    size: () => index.size,
    snapshot: () => new Map(index),
    findByReviewMessage: (reviewMessageId) => {
      const messageId = reviewIndex.get(reviewMessageId);
      return messageId ? index.get(messageId) || null : null;
    }
  };
};
