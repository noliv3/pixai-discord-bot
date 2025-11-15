const { Blob } = require('node:buffer');
const https = require('node:https');

const DEFAULT_TIMEOUT = 15000;
const TOKEN_TTL = 10 * 60 * 1000; // 10 Minuten

module.exports = function createScannerClient(scannerConfig = {}, logger) {
  const baseUrl = String(scannerConfig.baseUrl || '').replace(/\/+$/, '');
  const email = scannerConfig.email || '';
  const enabled = scannerConfig.enabled !== false && Boolean(baseUrl && email);

  let cachedToken = null;
  let tokenExpiresAt = 0;

  function isEnabled() {
    return enabled;
  }

  async function fetchToken({ renew = false } = {}) {
    if (!baseUrl || !email) {
      throw new Error('Scanner-Client ist nicht vollständig konfiguriert.');
    }

    const renewSuffix = renew ? '&renew=1' : '';
    const url = `${baseUrl}/token?email=${encodeURIComponent(email)}${renewSuffix}`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`Token error: ${response.status}`);
    }
    return (await response.text()).trim();
  }

  async function ensureToken({ forceRenew = false } = {}) {
    const now = Date.now();
    if (!forceRenew && cachedToken && now < tokenExpiresAt) {
      return cachedToken;
    }
    const token = await fetchToken({ renew: forceRenew });
    cachedToken = token;
    tokenExpiresAt = now + TOKEN_TTL;
    return cachedToken;
  }

  async function downloadToBuffer(url, { timeout = DEFAULT_TIMEOUT } = {}) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { timeout }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed ${res.statusCode}`));
          return;
        }

        const mime = res.headers['content-type'] || 'application/octet-stream';
        const chunks = [];

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            buffer: Buffer.concat(chunks),
            mime
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Download timeout'));
      });

      req.on('error', (err) => {
        reject(err);
      });
    });
  }

  function buildForm({ fieldName, buffer, mime, filename }) {
    const form = new FormData();
    form.append(fieldName, new Blob([buffer], { type: mime }), filename || 'upload.bin');
    return form;
  }

  async function sendMultipart({ path, fieldName, buffer, mime, filename }) {
    if (!isEnabled()) {
      return { ok: false, status: 503, error: 'Scanner disabled' };
    }

    let token;
    try {
      token = await ensureToken();
    } catch (error) {
      logger?.error?.('Token konnte nicht abgerufen werden', { error: error.message });
      return { ok: false, status: 0, error: error.message };
    }

    async function doRequest(currentToken) {
      const response = await fetch(`${baseUrl}/${path}`, {
        method: 'POST',
        headers: { Authorization: currentToken },
        body: buildForm({ fieldName, buffer, mime: mime || 'application/octet-stream', filename })
      });
      return response;
    }

    let response;
    try {
      response = await doRequest(token);
    } catch (error) {
      logger?.error?.('Scanner-Upload fehlgeschlagen', { error: error.message, path });
      return { ok: false, status: 0, error: error.message };
    }

    if (response.status === 403) {
      try {
        token = await ensureToken({ forceRenew: true });
        response = await doRequest(token);
      } catch (error) {
        logger?.error?.('Token-Renew fehlgeschlagen', { error: error.message });
        return { ok: false, status: 403, error: error.message };
      }
    }

    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      const text = await response.text().catch(() => '');
      return {
        ok: false,
        status: response.status,
        error: text || error.message
      };
    }

    if (!response.ok) {
      const error = typeof data === 'object' ? data?.error || JSON.stringify(data) : String(data);
      return { ok: false, status: response.status, error };
    }

    return { ok: true, status: response.status, data };
  }

  async function scanImage(buffer, filename, mimeType) {
    return sendMultipart({ path: 'check', fieldName: 'image', buffer, mime: mimeType, filename });
  }

  async function scanBatch(buffer, mimeType, filename = 'upload.bin') {
    return sendMultipart({ path: 'batch', fieldName: 'file', buffer, mime: mimeType, filename });
  }

  async function checkImageFromUrl(url, { filename, contentType, timeout } = {}) {
    const { buffer, mime } = await downloadToBuffer(url, { timeout });
    return scanImage(buffer, filename || null, contentType || mime);
  }

  async function batchFromUrl(url, { filename, contentType, timeout } = {}) {
    const { buffer, mime } = await downloadToBuffer(url, { timeout });
    return scanBatch(buffer, contentType || mime, filename || 'upload.bin');
  }

  async function getStats() {
    if (!isEnabled()) {
      return { ok: false, status: 503, error: 'Scanner disabled' };
    }
    let token;
    try {
      token = await ensureToken();
    } catch (error) {
      return { ok: false, status: 0, error: error.message };
    }

    try {
      const response = await fetch(`${baseUrl}/stats`, {
        method: 'GET',
        headers: { Authorization: token }
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return { ok: false, status: response.status, error: text };
      }
      const data = await response.json().catch(() => ({}));
      return { ok: true, status: response.status, data };
    } catch (error) {
      logger?.error?.('Scanner-Status konnte nicht geladen werden', { error: error.message });
      return { ok: false, status: 0, error: error.message };
    }
  }

  return {
    isEnabled,
    ensureToken,
    scanImage,
    scanBatch,
    checkImageFromUrl,
    batchFromUrl,
    getStats
  };
};
