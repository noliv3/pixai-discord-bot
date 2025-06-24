// /lib/publicScanHandler.js
const { scanImage }       = require('./scan');
const { evaluateTags }    = require('./scannerFilter');
const { extractTags }     = require('./tagUtils');
const { isRecentlyScanned, markScanned } = require('./scanCache');
const { calculateRisk } = require('./riskUtils');

function alreadyScannedPublic(messageId) {
  const key = `public:${messageId}`;
  if (isRecentlyScanned(key)) return true;
  markScanned(key);
  return false;
}

function extractRisk(data) {
  const scores = data.modules?.nsfw_scanner?.scores;
  if (!scores || typeof scores !== 'object') return 0;
  return calculateRisk(scores);
}

function formatDisplay(level, matched, tags, risk, message, client) {
  const color =
    level === 1 ? 0xff0000 :
    level === 2 ? 0xff9900 :
                  0x00cc66;

  const limited = tags.slice(0, 15);
  const triggered = limited.filter(t => matched.includes(t.toLowerCase()));
  const jumpLink = `https://discord.com/channels/${message.guildId}/${message.channel.id}/${message.id}`;
  const botAvatar = client?.user?.displayAvatarURL?.({ extension: 'png', forceStatic: true }) || null;

  const descriptionLines = [];

  if (triggered.length > 0) {
    descriptionLines.push(`**Triggered Tags:** ${triggered.join(', ')}`);
  }

  descriptionLines.push(`**All Tags:** ${limited.join(', ')}`);
  descriptionLines.push(`Risk Score: ${risk.toFixed(3)} | ${jumpLink} from ${message.author.username}`);

  return {
    ...(botAvatar ? { thumbnail: { url: botAvatar } } : {}),
    description: descriptionLines.join('\n'),
    color
  };
}

async function handlePublicScan(message, attachment, client) {
  if (alreadyScannedPublic(message.id)) return;

  const data = await scanImage(attachment.url);
  if (!data) {
    await message.channel.send('❌ Image scan failed.');
    return;
  }

  const tags       = extractTags(data);
  const evaluation = evaluateTags(tags.map(t => t.toLowerCase()));
  const risk       = extractRisk(data);

  if (evaluation.level === 0) return;

  const embed = formatDisplay(evaluation.level, evaluation.matched, tags, risk, message, client);
  await message.channel.send({ embeds: [embed] });
}

module.exports = { handlePublicScan };
