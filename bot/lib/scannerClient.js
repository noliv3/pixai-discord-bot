const { request } = require('undici');
const { FormData, File } = require('formdata-node');
const { FormDataEncoder } = require('form-data-encoder');
const { Readable } = require('node:stream');

const DEFAULT_TOKEN_TTL = 10 * 60 * 1000;
const TOKEN_EARLY_REFRESH_MS = 30_000;

const tokenCache = new Map();
const pendingTokenRequests = new Map();

function normalizeBaseUrl(scannerConfig = {}) {
  if (!scannerConfig || typeof scannerConfig.baseUrl !== 'string') {
    return '';
  }
  return scannerConfig.baseUrl.replace(/\/+$/, '');
}

function getTokenCacheKey(baseUrl, scannerConfig = {}) {
  const email = scannerConfig.email || '';
  const clientId = scannerConfig.clientId || '';
  return `${baseUrl}::${email}::${clientId}`;
}

function resolveTokenTtl(scannerConfig = {}) {
  const ttl = Number(scannerConfig.tokenTtlMs);
  if (Number.isFinite(ttl) && ttl > 0) {
    return ttl;
  }
  return DEFAULT_TOKEN_TTL;
}

function safeJsonParse(payload) {
  try {
    return JSON.parse(payload);
  } catch (error) {
    return payload;
  }
}

async function fetchToken(baseUrl, scannerConfig, { renew = false, logger } = {}) {
  if (!scannerConfig?.email) {
    throw new Error('Scanner-Konfiguration erfordert eine Email-Adresse.');
  }

  const url = new URL(`${baseUrl}/token`);
  url.searchParams.set('email', scannerConfig.email);
  if (scannerConfig.clientId) {
    url.searchParams.set('clientId', scannerConfig.clientId);
  }
  if (renew) {
    url.searchParams.set('renew', '1');
  }

  const headersTimeout = Number(scannerConfig.tokenRequestTimeoutMs) || 5_000;
  const response = await request(url, {
    method: 'GET',
    headers: {
      Accept: 'text/plain'
    },
    headersTimeout,
    bodyTimeout: headersTimeout
  });

  const body = await response.body.text();
  if (response.statusCode >= 400) {
    throw new Error(`Tokenabruf fehlgeschlagen (${response.statusCode})${body ? `: ${body}` : ''}`);
  }

  const token = String(body || '').trim();
  if (!token) {
    throw new Error('Scanner lieferte keinen Token.');
  }

  if (logger) {
    const message = renew ? 'Scanner-Token erneuert' : 'Scanner-Token abgerufen';
    logger.info?.(message);
  }

  return token;
}

async function ensureToken(scannerConfig = {}, { logger, forceRenew = false } = {}) {
  const baseUrl = normalizeBaseUrl(scannerConfig);
  if (!baseUrl) {
    return null;
  }

  const cacheKey = getTokenCacheKey(baseUrl, scannerConfig);
  const now = Date.now();
  const ttl = resolveTokenTtl(scannerConfig);
  const cached = tokenCache.get(cacheKey);

  if (!forceRenew && cached && now < cached.expiresAt - TOKEN_EARLY_REFRESH_MS) {
    return cached.value;
  }

  if (forceRenew) {
    pendingTokenRequests.delete(cacheKey);
  }

  if (!forceRenew && pendingTokenRequests.has(cacheKey)) {
    return pendingTokenRequests.get(cacheKey);
  }

  const tokenPromise = (async () => {
    try {
      const token = await fetchToken(baseUrl, scannerConfig, { renew: forceRenew, logger });
      tokenCache.set(cacheKey, {
        value: token,
        expiresAt: Date.now() + ttl
      });
      return token;
    } catch (error) {
      tokenCache.delete(cacheKey);
      throw error;
    } finally {
      pendingTokenRequests.delete(cacheKey);
    }
  })();

  pendingTokenRequests.set(cacheKey, tokenPromise);
  return tokenPromise;
}

async function downloadBinary(url, { timeout = 20_000 } = {}) {
  const response = await request(url, {
    method: 'GET',
    maxRedirections: 2,
    headersTimeout: timeout,
    bodyTimeout: timeout
  });

  if (response.statusCode >= 400) {
    const errorBody = await response.body.text().catch(() => '');
    throw new Error(`Download fehlgeschlagen (${response.statusCode})${errorBody ? `: ${errorBody}` : ''}`);
  }

  const arrayBuffer = await response.body.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers['content-type'] || null;
  return { buffer, contentType };
}

function createMultipartBody(form) {
  const encoder = new FormDataEncoder(form);
  return {
    headers: encoder.headers,
    body: Readable.from(encoder.encode())
  };
}

async function postMultipart(scannerConfig, path, createForm, { logger } = {}, attempt = 0) {
  const baseUrl = normalizeBaseUrl(scannerConfig);
  if (!baseUrl) {
    return { ok: false, disabled: true, data: null };
  }

  try {
    const token = await ensureToken(scannerConfig, { logger, forceRenew: attempt > 0 });
    if (!token) {
      throw new Error('Kein Token verfügbar.');
    }

    const form = createForm();
    const { headers, body } = createMultipartBody(form);

    const response = await request(`${baseUrl}/${path}`, {
      method: 'POST',
      headers: {
        ...headers,
        Authorization: token
      },
      body,
      headersTimeout: Number(scannerConfig.uploadHeadersTimeoutMs) || 15_000,
      bodyTimeout: Number(scannerConfig.uploadBodyTimeoutMs) || 30_000
    });

    const raw = await response.body.text();
    const contentType = response.headers['content-type'] || '';
    const data = raw
      ? contentType.includes('application/json')
        ? safeJsonParse(raw)
        : raw
      : null;

    if (response.statusCode === 403 && attempt === 0) {
      logger?.warn?.('Scanner antwortete mit 403 – Token wird erneuert und Anfrage wiederholt', { path });
      const cacheKey = getTokenCacheKey(baseUrl, scannerConfig);
      tokenCache.delete(cacheKey);
      await ensureToken(scannerConfig, { logger, forceRenew: true });
      return postMultipart(scannerConfig, path, createForm, { logger }, attempt + 1);
    }

    const ok = response.statusCode >= 200 && response.statusCode < 300;
    if (!ok) {
      logger?.error?.('Scanner-Anfrage fehlgeschlagen', {
        path,
        status: response.statusCode,
        body: raw || null
      });
    }

    return {
      ok,
      status: response.statusCode,
      data
    };
  } catch (error) {
    logger?.error?.('Scanner-Anfrage schlug fehl', { path, error: error.message });
    return {
      ok: false,
      error: error.message,
      data: null
    };
  }
}

async function checkImageFromUrl(scannerConfig, imageUrl, options = {}) {
  const { logger = null, filename = 'upload', contentType = null, downloadTimeoutMs = 15_000 } = options;
  const baseUrl = normalizeBaseUrl(scannerConfig);
  if (!baseUrl) {
    return { ok: false, disabled: true, data: null };
  }

  try {
    const download = await downloadBinary(imageUrl, { timeout: downloadTimeoutMs });
    const mime = contentType || download.contentType || 'image/jpeg';
    const buffer = download.buffer;

    return postMultipart(
      scannerConfig,
      'check',
      () => {
        const form = new FormData();
        form.set('image', new File([buffer], filename || 'upload', { type: mime }));
        return form;
      },
      { logger }
    );
  } catch (error) {
    logger?.error?.('checkImageFromUrl fehlgeschlagen', { error: error.message, url: imageUrl });
    return { ok: false, error: error.message, data: null };
  }
}

async function batchFromUrl(scannerConfig, fileUrl, options = {}) {
  const { logger = null, filename = 'upload', contentType = null, downloadTimeoutMs = 20_000 } = options;
  const baseUrl = normalizeBaseUrl(scannerConfig);
  if (!baseUrl) {
    return { ok: false, disabled: true, data: null };
  }

  try {
    const download = await downloadBinary(fileUrl, { timeout: downloadTimeoutMs });
    const mime = contentType || download.contentType || 'application/octet-stream';
    const buffer = download.buffer;

    return postMultipart(
      scannerConfig,
      'batch',
      () => {
        const form = new FormData();
        form.set('file', new File([buffer], filename || 'upload', { type: mime }));
        return form;
      },
      { logger }
    );
  } catch (error) {
    logger?.error?.('batchFromUrl fehlgeschlagen', { error: error.message, url: fileUrl });
    return { ok: false, error: error.message, data: null };
  }
}

async function scanImage(scannerConfig, buffer, filename, mimeType, options = {}) {
  const logger = options.logger || null;
  const baseUrl = normalizeBaseUrl(scannerConfig);
  if (!baseUrl) {
    return { ok: false, disabled: true, data: null };
  }

  return postMultipart(
    scannerConfig,
    'check',
    () => {
      const form = new FormData();
      form.set('image', new File([buffer], filename || 'upload', { type: mimeType || 'image/jpeg' }));
      return form;
    },
    { logger }
  );
}

async function scanBatch(scannerConfig, buffer, mimeType, options = {}) {
  const logger = options.logger || null;
  const baseUrl = normalizeBaseUrl(scannerConfig);
  if (!baseUrl) {
    return { ok: false, disabled: true, data: null };
  }

  return postMultipart(
    scannerConfig,
    'batch',
    () => {
      const form = new FormData();
      form.set('file', new File([buffer], 'upload', { type: mimeType || 'application/octet-stream' }));
      return form;
    },
    { logger }
  );
}

async function getStats(scannerConfig, options = {}) {
  const logger = options.logger || null;
  const baseUrl = normalizeBaseUrl(scannerConfig);
  if (!baseUrl) {
    return { ok: false, disabled: true, data: null };
  }

  try {
    const token = await ensureToken(scannerConfig, { logger });
    if (!token) {
      throw new Error('Kein Token verfügbar.');
    }

    const response = await request(`${baseUrl}/stats`, {
      method: 'GET',
      headers: {
        Authorization: token
      },
      headersTimeout: Number(scannerConfig.statsHeadersTimeoutMs) || 10_000,
      bodyTimeout: Number(scannerConfig.statsBodyTimeoutMs) || 10_000
    });

    const raw = await response.body.text();
    const contentType = response.headers['content-type'] || '';
    const data = raw
      ? contentType.includes('application/json')
        ? safeJsonParse(raw)
        : raw
      : null;

    const ok = response.statusCode >= 200 && response.statusCode < 300;
    if (!ok) {
      logger?.error?.('getStats fehlgeschlagen', {
        status: response.statusCode,
        body: raw || null
      });
    }

    return {
      ok,
      status: response.statusCode,
      data
    };
  } catch (error) {
    logger?.error?.('getStats fehlgeschlagen', { error: error.message });
    return {
      ok: false,
      error: error.message,
      data: null
    };
  }
}

function createScannerClient(scannerConfig = {}, logger) {
  const baseUrl = normalizeBaseUrl(scannerConfig);
  const disabled = !baseUrl;

  return {
    isEnabled: () => !disabled,
    ensureToken: () => ensureToken(scannerConfig, { logger }),
    checkImageFromUrl: (imageUrl, options = {}) =>
      checkImageFromUrl(scannerConfig, imageUrl, { ...options, logger }),
    batchFromUrl: (fileUrl, options = {}) =>
      batchFromUrl(scannerConfig, fileUrl, { ...options, logger }),
    scanImage: (buffer, filename, mimeType) =>
      scanImage(scannerConfig, buffer, filename, mimeType, { logger }),
    scanBatch: (buffer, mimeType) =>
      scanBatch(scannerConfig, buffer, mimeType, { logger }),
    getStats: () => getStats(scannerConfig, { logger })
  };
}

module.exports = createScannerClient;
module.exports.ensureToken = ensureToken;
module.exports.checkImageFromUrl = (scannerConfig, imageUrl, options = {}) =>
  checkImageFromUrl(scannerConfig, imageUrl, options);
module.exports.batchFromUrl = (scannerConfig, fileUrl, options = {}) =>
  batchFromUrl(scannerConfig, fileUrl, options);
module.exports.scanImage = (scannerConfig, buffer, filename, mimeType, options = {}) =>
  scanImage(scannerConfig, buffer, filename, mimeType, options);
module.exports.scanBatch = (scannerConfig, buffer, mimeType, options = {}) =>
  scanBatch(scannerConfig, buffer, mimeType, options);
module.exports.getStats = (scannerConfig, options = {}) => getStats(scannerConfig, options);
module.exports.normalizeBaseUrl = normalizeBaseUrl;
