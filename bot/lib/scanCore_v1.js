const path = require('path');

const { resolveImageUrl, isLikelyMedia } = require('./urlSanitizer_v1');
const { extractTags, highlightTags } = require('./tagUtils_v1');
const scanCache = require('./scanCache_v1');
const riskEngine = require('./riskEngine_v1');

const BATCH_EXTENSIONS = new Set(['.gif', '.mp4', '.webm', '.mov', '.m4v']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp']);
const PUBLIC_SCAN_PREFIX = 'public:';

const USER_AGENT = 'PixAI-DiscordBot/2.0 (+https://pixai.ai)';

function normalizeScannerPayload(data) {
  if (!data || typeof data !== 'object') {
    return { raw: data, modules: {}, scores: {} };
  }

  const normalized = {
    raw: data,
    modules: {},
    scores: {}
  };

  if (data.modules && typeof data.modules === 'object') {
    normalized.modules = { ...data.modules };
  }

  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith('modules.')) continue;
    const moduleName = key.slice(8);
    normalized.modules[moduleName] = value;
  }

  if (data.scores && typeof data.scores === 'object') {
    normalized.scores = { ...data.scores };
  }

  if (Object.keys(normalized.scores).length === 0) {
    const nsfwModule = normalized.modules.nsfw_scanner;
    if (nsfwModule && typeof nsfwModule === 'object') {
      if (nsfwModule.scores && typeof nsfwModule.scores === 'object') {
        normalized.scores = { ...nsfwModule.scores };
      } else {
        const flatScores = {};
        for (const [name, value] of Object.entries(nsfwModule)) {
          if (typeof value === 'number') {
            flatScores[name] = value;
            continue;
          }
          if (typeof value === 'string') {
            const numeric = Number.parseFloat(value);
            if (!Number.isNaN(numeric)) {
              flatScores[name] = numeric;
            }
          }
        }
        if (Object.keys(flatScores).length > 0) {
          normalized.scores = flatScores;
        }
      }
    }
  }

  return normalized;
}

function toExtension(name = '') {
  const match = /\.([a-z0-9]+)$/i.exec(name.split('?')[0] || '');
  return match ? `.${match[1].toLowerCase()}` : '';
}

function shouldUseBatch({ extension, mimeType }) {
  const ext = extension || '';
  if (BATCH_EXTENSIONS.has(ext)) return true;
  if (!mimeType) return false;
  const lower = mimeType.toLowerCase();
  return lower.startsWith('video/') || lower === 'image/gif';
}

function buildCacheKey(messageId, url) {
  return `${messageId}:${url}`;
}

async function fetchMessageByLink(client, link, logger) {
  const pattern = /^https?:\/\/(?:ptb\.|canary\.)?discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/i;
  const match = pattern.exec(link);
  if (!match) return null;
  const [, guildId, channelId, messageId] = match;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return null;
    if (channel.guildId !== guildId) return null;
    const fetched = await channel.messages.fetch(messageId);
    return fetched;
  } catch (error) {
    logger?.debug?.('Konnte Nachrichten-Link nicht auflösen', { url: link, error: error.message });
    return null;
  }
}

async function resolveReferencedMessages(message, client, logger) {
  const related = [];
  if (message.reference?.messageId) {
    try {
      const ref = await message.fetchReference();
      if (ref) related.push({ message: ref, origin: 'reply' });
    } catch (error) {
      logger?.debug?.('Konnte Reply-Referenz nicht laden', { messageId: message.id, error: error.message });
    }
  }

  const linkMatches = message.content?.match(/https?:\/\/[^\s<>]+/g) || [];
  for (const link of linkMatches) {
    const resolved = await fetchMessageByLink(client, link, logger);
    if (resolved) {
      related.push({ message: resolved, origin: 'message-link' });
    }
  }

  return related;
}

function collectFromMessage(baseMessage, origin, seen) {
  const targets = [];
  for (const attachment of baseMessage.attachments?.values?.() || []) {
    const url = attachment.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const extension = toExtension(attachment.name || url);
    targets.push({
      url,
      name: attachment.name || path.basename(url),
      contentType: attachment.contentType || null,
      origin,
      type: 'attachment',
      extension,
      message: baseMessage
    });
  }

  for (const embed of baseMessage.embeds || []) {
    const urls = [
      embed.image?.url,
      embed.image?.proxyURL,
      embed.thumbnail?.url,
      embed.thumbnail?.proxyURL,
      embed.url
    ].filter(Boolean);
    for (const url of urls) {
      if (seen.has(url)) continue;
      seen.add(url);
      const extension = toExtension(url);
      targets.push({
        url,
        name: path.basename(url),
        contentType: null,
        origin,
        type: 'embed',
        extension,
        message: baseMessage
      });
    }
  }

  if (origin === 'message') {
    const urlMatches = baseMessage.content?.match(/https?:\/\/[^\s<>]+/g) || [];
    for (const url of urlMatches) {
      if (seen.has(url)) continue;
      seen.add(url);
      const extension = toExtension(url);
      targets.push({
        url,
        name: path.basename(url),
        contentType: null,
        origin: 'link',
        type: 'link',
        extension,
        message: baseMessage
      });
    }
  }

  return targets;
}

async function collectTargets(message, client, logger) {
  const seen = new Set();
  const targets = [];

  const related = await resolveReferencedMessages(message, client, logger);
  const allMessages = [{ message, origin: 'message' }, ...related];

  for (const entry of allMessages) {
    targets.push(...collectFromMessage(entry.message, entry.origin, seen));
  }

  return targets;
}

async function downloadTarget(target, logger) {
  let url = target.url;
  let mimeType = target.contentType || null;

  if (target.type === 'link') {
    const resolved = await resolveImageUrl(url, { logger });
    if (!resolved) return null;
    url = resolved.url;
    mimeType = resolved.contentType || mimeType;
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      logger?.warn?.('Download fehlgeschlagen', { url, status: response.status });
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    mimeType = mimeType || response.headers.get('content-type') || null;
    if (!mimeType || !isLikelyMedia(mimeType)) {
      const ext = toExtension(url);
      if (!IMAGE_EXTENSIONS.has(ext) && !BATCH_EXTENSIONS.has(ext)) {
        logger?.debug?.('Unbekannter Content-Type – übersprungen', { url, mimeType });
        return null;
      }
    }
    let filename = target.name || null;
    if (!filename) {
      try {
        const parsed = new URL(url);
        filename = path.basename(parsed.pathname) || 'upload';
      } catch (error) {
        filename = 'upload';
      }
    }
    const extension = toExtension(filename) || toExtension(url) || target.extension;
    const useBatch = shouldUseBatch({ extension, mimeType });
    return { buffer, mimeType, filename, finalUrl: response.url || url, useBatch };
  } catch (error) {
    logger?.warn?.('Fehler beim Herunterladen eines Medienobjekts', { url, error: error.message });
    return null;
  }
}

async function scanTarget({ target, scanner, filters, thresholds, logger }) {
  const cacheKey = buildCacheKey(target.message.id, target.url);
  if (scanCache.isRecentlyScanned(cacheKey)) {
    return null;
  }

  const download = await downloadTarget(target, logger);
  if (!download) {
    scanCache.markScanned(cacheKey);
    return null;
  }

  try {
    const { buffer, mimeType, filename, finalUrl, useBatch } = download;
    const response = useBatch
      ? await scanner.scanBatch(buffer, mimeType)
      : await scanner.scanImage(buffer, filename, mimeType);
    scanCache.markScanned(cacheKey);
    if (!response?.ok || !response.data) {
      logger?.warn?.('Scanner-Antwort ungültig', { url: finalUrl, status: response?.status, error: response?.error });
      return null;
    }
    const normalized = normalizeScannerPayload(response.data);
    const data = normalized.raw;
    const tags = extractTags(data);
    const lowerTags = tags.map((tag) => tag.toLowerCase());
    const { level, matched } = riskEngine.evaluateTags(lowerTags, filters);
    const scores = normalized.scores;
    const risk = riskEngine.calculateRisk(scores);
    const decision = riskEngine.determineAction({ level, risk, thresholds });
    return {
      target,
      download,
      data,
      modules: normalized.modules,
      scores,
      tags,
      lowerTags,
      matched,
      level,
      risk,
      decision
    };
  } catch (error) {
    scanCache.markScanned(cacheKey);
    logger?.error?.('Scanner-Aufruf fehlgeschlagen', { url: target.url, error: error.message });
    return null;
  }
}

function applyResultsToMessage(message, results) {
  if (!message._pixai) {
    Object.defineProperty(message, '_pixai', {
      value: {},
      configurable: true
    });
  }
  const formatted = results.map((entry) => ({
    attachment: {
      name: entry.target.name,
      url: entry.download.finalUrl
    },
    scan: {
      risk: entry.risk,
      tags: entry.tags,
      matched: entry.matched,
      level: entry.level,
      status: entry.decision.action
    }
  }));
  message._pixai.scanResults = formatted;
}

function buildEmbedPayload(message, summary) {
  const tagsPreview = highlightTags(
    summary.actedItems.flatMap((item) => item.tags),
    summary.matchedTags
  );
  return {
    color: summary.action === 'delete' ? 0xff0000 : summary.action === 'flag' ? 0xff9900 : 0x00cc66,
    title: summary.action === 'delete' ? '🚫 Automatische Löschung' : '⚠️ Automatische Flagging',
    description: [
      `**User:** <@${message.author.id}> (\`${message.author.tag}\`)`,
      `**Kanal:** <#${message.channelId}>`,
      `**Risk:** ${summary.highestRisk.toFixed(3)} | Level ${summary.highestLevel}`,
      `**Tags:** ${tagsPreview}`,
      `[Zum Original](${message.url})`
    ].join('\n'),
    footer: {
      text: summary.reasons.join(', ') || 'auto-scan'
    }
  };
}

async function scanMessage(context) {
  const { message, client, scanner, guildConfig, globalConfig, logger } = context;
  if (!message.guild) return null;
  if (!guildConfig?.scan?.enabled) return null;
  if (!scanner?.isEnabled?.()) return null;

  const filters = riskEngine.resolveFilters(globalConfig, guildConfig);
  const thresholds = riskEngine.resolveThresholds(guildConfig, globalConfig);

  const targets = await collectTargets(message, client, logger);
  if (targets.length === 0) return null;

  const results = [];
  for (const target of targets) {
    const scanned = await scanTarget({ target, scanner, filters, thresholds, logger });
    if (scanned) {
      results.push(scanned);
    }
  }
  if (results.length === 0) return null;

  applyResultsToMessage(message, results);
  const summary = riskEngine.summarize(results);
  const embed = buildEmbedPayload(message, summary);
  return { results, summary, embed };
}

async function publicScan(message, context) {
  const key = `${PUBLIC_SCAN_PREFIX}${message.id}`;
  if (scanCache.isRecentlyScanned(key)) return null;
  scanCache.markScanned(key);
  return scanMessage(context);
}

module.exports = {
  scanMessage,
  publicScan,
  collectTargets
};
