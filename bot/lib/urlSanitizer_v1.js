const fs = require('fs');
const path = require('path');

const INVALID_DIR = path.join(__dirname, '..', 'data', 'logs');
const INVALID_FILE = path.join(INVALID_DIR, 'invalid-urls.log');

const USER_AGENT = 'PixAI-DiscordBot/2.0 (+https://pixai.ai)';

function ensureLogDir() {
  try {
    fs.mkdirSync(INVALID_DIR, { recursive: true });
  } catch (error) {
    // ignore mkdir race
  }
}

function logInvalidUrl(url, logger) {
  try {
    ensureLogDir();
    const ts = new Date().toISOString();
    fs.appendFileSync(INVALID_FILE, `${ts} ${url}\n`, 'utf8');
  } catch (error) {
    logger?.warn?.('Konnte invalid-urls.log nicht schreiben', { error: error.message });
  }
}

function isLikelyMedia(contentType) {
  if (!contentType) return false;
  const lower = contentType.toLowerCase();
  return lower.startsWith('image/') || lower.startsWith('video/') || lower === 'application/octet-stream';
}

async function fetchWithRetry(url, options = {}, attempt = 0) {
  try {
    const controller = AbortSignal.timeout(options.timeout ?? 8000);
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'image/*;q=0.9,video/*;q=0.8,text/html;q=0.7,*/*;q=0.5',
        ...options.headers
      },
      method: options.method || 'GET',
      signal: controller
    });
    return response;
  } catch (error) {
    if (attempt >= 1) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    return fetchWithRetry(url, options, attempt + 1);
  }
}

function extractOgImageUrl(html) {
  if (!html) return null;
  const match = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(html);
  if (!match) return null;
  return match[1];
}

async function resolveImageUrl(rawUrl, { logger, depth = 0 } = {}) {
  if (!rawUrl || depth > 2) return null;
  try {
    const head = await fetchWithRetry(rawUrl, { method: 'HEAD' });
    if (head.ok) {
      const type = head.headers.get('content-type');
      if (isLikelyMedia(type)) {
        return { url: head.url || rawUrl, contentType: type || null };
      }
    }
  } catch (error) {
    logger?.debug?.('HEAD-Request fehlgeschlagen – fallback GET', { url: rawUrl, error: error.message });
  }

  try {
    const response = await fetchWithRetry(rawUrl, { method: 'GET', timeout: 10000 });
    if (!response.ok) {
      logger?.warn?.('GET-Request für URL fehlgeschlagen', { url: rawUrl, status: response.status });
      logInvalidUrl(rawUrl, logger);
      return null;
    }
    const type = response.headers.get('content-type') || '';
    if (isLikelyMedia(type)) {
      return { url: response.url || rawUrl, contentType: type || null };
    }
    if (type.toLowerCase().includes('text/html')) {
      const text = await response.text();
      const ogUrl = extractOgImageUrl(text);
      if (ogUrl) {
        const resolved = new URL(ogUrl, response.url || rawUrl).toString();
        return resolveImageUrl(resolved, { logger, depth: depth + 1 });
      }
    }
    logInvalidUrl(rawUrl, logger);
    return null;
  } catch (error) {
    logger?.warn?.('Konnte URL nicht prüfen', { url: rawUrl, error: error.message });
    logInvalidUrl(rawUrl, logger);
    return null;
  }
}

module.exports = {
  resolveImageUrl,
  extractOgImageUrl,
  logInvalidUrl,
  isLikelyMedia
};
