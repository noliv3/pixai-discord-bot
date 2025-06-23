// /lib/publicScanHandler.js
const { scanImage }       = require('./scan');
const { evaluateTags }    = require('./scannerFilter');
const { extractTags }     = require('./tagUtils');
const { isRecentlyScanned, markScanned } = require('./scanCache');  // persistenter Cache

/* 10-min-Spam-Schutz nur für ❓-Scans */
function alreadyScannedPublic(messageId) {
  const key = `public:${messageId}`;          // ⬅️ separater Schlüssel
  if (isRecentlyScanned(key)) return true;
  markScanned(key);
  return false;
}

/* Ausgabeformat */
function formatDisplay(level, matched, tags) {
  const head =
      level === 0 ? '🛑 **Delete**'
    : level === 1 ? '🔞 **Explicit**'
    : level === 2 ? '⚠️ **Questionable**'
    : '🟢 Safe';

  const conflict =
      matched.length && level < 3
        ? `**Tags:** ${matched.map(t => `**${t}**`).join(', ')}`
        : '';

  const preview =
      tags.slice(0, 10)
          .map(t => matched.includes(t.toLowerCase()) ? `**${t}**` : t)
          .join(', ') || '—';

  return [head, conflict, `**All tags:** ${preview}`]
         .filter(Boolean)
         .join('\n');
}

/* Haupt-Handler – jetzt ohne Feedback bei Re-Scan */
async function handlePublicScan(message, attachment, client) {
  if (alreadyScannedPublic(message.id)) return;   // stilles Überspringen

  const data = await scanImage(attachment.url);
  if (!data) {
    await message.channel.send('Image scan failed.');
    return;
  }

  const tags       = extractTags(data);
  const evaluation = evaluateTags(tags.map(t => t.toLowerCase()));
  await message.channel.send(formatDisplay(evaluation.level, evaluation.matched, tags));
}

module.exports = { handlePublicScan };
