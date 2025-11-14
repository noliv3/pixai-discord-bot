// /lib/scanCache.js

const scanTimestamps = new Map();
const TTL = 600 * 1000;        // 10 Minuten Gültigkeit
const MAX_ENTRIES = 1000;      // Maximal 1000 gespeicherte Scans

function cleanupCache() {
    const now = Date.now();

    // Entferne alle abgelaufenen Einträge
    for (const [id, ts] of scanTimestamps.entries()) {
        if (now - ts > TTL) {
            scanTimestamps.delete(id);
        }
    }

    // Falls zu viele Einträge: Älteste entfernen
    if (scanTimestamps.size > MAX_ENTRIES) {
        const sorted = [...scanTimestamps.entries()].sort((a, b) => a[1] - b[1]);
        for (let i = 0; i < sorted.length - MAX_ENTRIES; i++) {
            scanTimestamps.delete(sorted[i][0]);
        }
    }
}

function isRecentlyScanned(messageId) {
    const lastScan = scanTimestamps.get(messageId);
    if (!lastScan) return false;
    return (Date.now() - lastScan) < TTL;
}

function markScanned(messageId) {
    scanTimestamps.set(messageId, Date.now());
    cleanupCache();
}

module.exports = {
    isRecentlyScanned,
    markScanned
};
