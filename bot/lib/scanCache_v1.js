const cache = new Map();

const DEFAULT_TTL = 10 * 60 * 1000;
const MAX_ENTRIES = 1000;

function cleanup(now = Date.now(), ttl = DEFAULT_TTL) {
  for (const [key, timestamp] of cache.entries()) {
    if (now - timestamp > ttl) {
      cache.delete(key);
    }
  }
  if (cache.size > MAX_ENTRIES) {
    const sorted = Array.from(cache.entries()).sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < sorted.length - MAX_ENTRIES; i += 1) {
      cache.delete(sorted[i][0]);
    }
  }
}

function isRecentlyScanned(key, ttl = DEFAULT_TTL) {
  const timestamp = cache.get(key);
  if (!timestamp) return false;
  if (Date.now() - timestamp > ttl) {
    cache.delete(key);
    return false;
  }
  return true;
}

function markScanned(key, ttl = DEFAULT_TTL) {
  cache.set(key, Date.now());
  cleanup(Date.now(), ttl);
}

module.exports = {
  isRecentlyScanned,
  markScanned
};
