const axios = require('axios');
const FormData = require('form-data');

module.exports = function createScannerClient(scannerConfig = {}, logger) {
  const baseUrl = typeof scannerConfig.baseUrl === 'string' ? scannerConfig.baseUrl.replace(/\/+$, '') : '';
  const disabled = !baseUrl;
  const clientLogger = logger?.child({ scope: 'scannerClient' });

  let cachedToken = null;
  let tokenExpiresAt = 0;
  let tokenPromise = null;

  function tokenTtlMs() {
    return Number(scannerConfig.tokenTtlMs) > 0 ? Number(scannerConfig.tokenTtlMs) : 10 * 60 * 1000;
  }

  async function fetchToken({ renew = false } = {}) {
    if (!scannerConfig.email) {
      throw new Error('Scanner-Konfiguration ist unvollständig (email fehlt).');
    }

    const params = { email: scannerConfig.email };
    if (scannerConfig.clientId) {
      params.clientId = scannerConfig.clientId;
    }
    if (renew) {
      params.renew = 1;
    }

    const url = `${baseUrl}/token`;

    const response = await axios.get(url, {
      params,
      timeout: 5000,
      responseType: 'text',
      transformResponse: [(data) => data]
    });

    const rawToken = String(response.data || '').trim();
    if (!rawToken) {
      throw new Error('Scanner lieferte keinen Token.');
    }

    cachedToken = rawToken;
    tokenExpiresAt = Date.now() + tokenTtlMs();
    clientLogger?.info(renew ? 'Scanner-Token erneuert' : 'Scanner-Token abgerufen');
    return cachedToken;
  }

  async function getToken({ forceRenew = false } = {}) {
    if (disabled) return null;

    const now = Date.now();
    if (!forceRenew && cachedToken && now < tokenExpiresAt - 30_000) {
      return cachedToken;
    }

    if (!tokenPromise) {
      tokenPromise = (async () => {
        try {
          return await fetchToken({ renew: forceRenew });
        } catch (error) {
          cachedToken = null;
          tokenExpiresAt = 0;
          throw error;
        } finally {
          tokenPromise = null;
        }
      })();
    }

    return tokenPromise;
  }

  function buildErrorPayload(error) {
    if (!error) return null;
    if (error.response?.data) return error.response.data;
    if (error.response?.statusText) return { error: error.response.statusText };
    return { error: error.message };
  }

  async function sendMultipart({ path, fieldName, buffer, filename, contentType }, attempt = 0) {
    if (disabled) {
      return { ok: false, disabled: true, data: null };
    }

    try {
      const token = await getToken({ forceRenew: attempt > 0 });
      if (!token) {
        throw new Error('Kein Token verfügbar.');
      }

      const form = new FormData();
      form.append(fieldName, buffer, {
        filename: filename || 'discord-upload',
        contentType: contentType || 'application/octet-stream'
      });

      const response = await axios.post(`${baseUrl}/${path}`, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: token
        },
        timeout: 30_000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });

      return { ok: true, status: response.status, data: response.data };
    } catch (error) {
      if (error.response?.status === 403 && attempt === 0) {
        clientLogger?.warn('Scanner antwortete mit 403 – erneuere Token und wiederhole Anfrage', { path });
        cachedToken = null;
        tokenExpiresAt = 0;
        await getToken({ forceRenew: true });
        return sendMultipart({ path, fieldName, buffer, filename, contentType }, 1);
      }

      clientLogger?.error('Scanner-Anfrage fehlgeschlagen', {
        path,
        error: error.message,
        status: error.response?.status
      });
      return {
        ok: false,
        status: error.response?.status,
        error: error.message,
        data: buildErrorPayload(error)
      };
    }
  }

  async function downloadBinary(url, timeout = 15_000) {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout
    });

    const buffer = Buffer.from(response.data);
    const contentType = response.headers?.['content-type'] || null;
    return { buffer, contentType };
  }

  async function checkImageFromUrl(imageUrl, options = {}) {
    if (disabled) return { ok: false, disabled: true, data: null };
    try {
      const download = await downloadBinary(imageUrl, 15_000);
      return await sendMultipart({
        path: 'check',
        fieldName: 'image',
        buffer: download.buffer,
        filename: options.filename || 'discord-upload',
        contentType: options.contentType || download.contentType || 'image/jpeg'
      });
    } catch (error) {
      clientLogger?.error('checkImageFromUrl fehlgeschlagen', { error: error.message, url: imageUrl });
      return { ok: false, error: error.message, data: null };
    }
  }

  async function batchFromUrl(fileUrl, options = {}) {
    if (disabled) return { ok: false, disabled: true, data: null };
    try {
      const download = await downloadBinary(fileUrl, 20_000);
      return await sendMultipart({
        path: 'batch',
        fieldName: 'file',
        buffer: download.buffer,
        filename: options.filename || 'discord-upload',
        contentType: options.contentType || download.contentType || 'application/octet-stream'
      });
    } catch (error) {
      clientLogger?.error('batchFromUrl fehlgeschlagen', { error: error.message, url: fileUrl });
      return { ok: false, error: error.message, data: null };
    }
  }

  async function scanImage(buffer, filename, mimeType) {
    return sendMultipart({
      path: 'check',
      fieldName: 'image',
      buffer,
      filename: filename || 'discord-upload',
      contentType: mimeType || 'image/jpeg'
    });
  }

  async function scanBatch(buffer, mimeType) {
    return sendMultipart({
      path: 'batch',
      fieldName: 'file',
      buffer,
      filename: 'discord-upload',
      contentType: mimeType || 'application/octet-stream'
    });
  }

  async function getStats() {
    if (disabled) {
      return { ok: false, disabled: true, data: null };
    }

    try {
      const token = await getToken();
      const response = await axios.get(`${baseUrl}/stats`, {
        headers: {
          Authorization: token
        },
        timeout: 10_000
      });
      return { ok: true, status: response.status, data: response.data };
    } catch (error) {
      clientLogger?.error('getStats fehlgeschlagen', { error: error.message });
      return {
        ok: false,
        status: error.response?.status,
        error: error.message,
        data: buildErrorPayload(error)
      };
    }
  }

  return {
    isEnabled: () => !disabled,
    getToken,
    checkImageFromUrl,
    batchFromUrl,
    scanImage,
    scanBatch,
    getStats
  };
};
