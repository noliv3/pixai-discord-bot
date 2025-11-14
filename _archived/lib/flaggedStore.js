const fs   = require('fs');
const path = require('path');
const storePath = path.join(__dirname, '..', 'data', 'flagged.json');

function loadFlaggedReviews() {
  try {
    if (fs.existsSync(storePath)) {
      const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      return new Map(raw);                 // [[key,val], …]
    }
  } catch (e) {
    console.warn('[flaggedStore] load failed:', e.message);
  }
  return new Map();
}

function saveFlaggedReviews(map) {
  try {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify([...map], null, 2));
  } catch (e) {
    console.warn('[flaggedStore] save failed:', e.message);
  }
}

module.exports = { loadFlaggedReviews, saveFlaggedReviews };
