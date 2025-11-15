const { Blob } = require('buffer');
const { setTimeout: delay } = require('timers/promises');

function buildUrl(base, pathname, params = {}) {
  const url = new URL(pathname, base.endsWith('/') ? base : `${base}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  return url;
}

function toJSONSafe(payload) {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === 'object') return payload;
  try {
    return JSON.parse(payload);
  } catch (error) {
    return { raw: String(payload) };
  }
}

module.exports = function createScannerClient(scannerConfig = {}, logger) {
  const disabled = !scannerConfig.baseUrl;
  let token = null;
  let tokenExpiresAt = 0;
  let isRenewing = false;

  const clientLogger = logger?.child({ scope: 'scannerClient' });

  async function ensureToken({ renew = false } = {}) {
    if (disabled) return null;

    if (!scannerConfig.email || !scannerConfig.clientId) {
      throw new Error('Scanner-Konfiguration ist unvollständig (email/clientId).');
    }

    const now = Date.now();
    if (!renew && token && tokenExpiresAt - 60_000 > now) {
      return token;
    }

    while (isRenewing) {
      await delay(100);
    }

    isRenewing = true;
    try {
      const url = buildUrl(scannerConfig.baseUrl, 'token', {
        email: scannerConfig.email,
        clientId: scannerConfig.clientId,
        renew: renew ? '1' : undefined
      });

      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8' },
        signal: AbortSignal.timeout(scannerConfig.timeoutMs || 10000)
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Tokenabruf fehlgeschlagen (${res.status}): ${text}`);
      }

      const raw = await res.text();
      let parsed = null;
      let newToken = null;

      // Versuch JSON → Fallback auf reinen Text
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }

      if (parsed && typeof parsed === 'object' && parsed.token) {
        newToken = String(parsed.token);
        const ttl = Number(parsed.expiresIn || parsed.expires_in || 600);
        tokenExpiresAt = Date.now() + ttl * 1000;
      } else {
        newToken = String(raw).trim();
        const ttl = 600; // 10 Minuten Fallback
        tokenExpiresAt = Date.now() + ttl * 1000;
      }

      if (!newToken) {
        throw new Error(`Kein Token in Antwort von /token: "${raw}"`);
      }

      token = newToken;
      clientLogger?.info('Scanner-Token erneuert');
      return token;
    } finally {
      isRenewing = false;
    }
  }

  async function perform(pathname, options = {}, attempt = 0) {
    if (disabled) {
      return { ok: false, disabled: true, data: null };
    }

    try {
      const authToken = await ensureToken({ renew: attempt > 0 });
      const url = buildUrl(scannerConfig.baseUrl, pathname);

      const headers = {
        ...(options.headers || {}),
        // Scanner erwartet den Token direkt, ohne "Bearer "
        Authorization: authToken || undefined
      };

      const response = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(scannerConfig.timeoutMs || 15000)
      });

      if (response.status === 403 && attempt === 0) {
        clientLogger?.warn('Scanner antwortete mit 403 – versuche Token zu erneuern');
        await ensureToken({ renew: true });
        return perform(pathname, options, 1);
      }

      const text = await response.text();
      const data = toJSONSafe(text);
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      clientLogger?.error('Scanner-Anfrage fehlgeschlagen', { error: error.message, path: pathname });
      return { ok: false, error: error.message };
    }
  }

  async function scanImage(buffer, filename, mimeType) {
    if (disabled) return { ok: false, disabled: true };
    try {
      const formData = new FormData();
      const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
      formData.append('file', blob, filename || 'upload');

      const result = await perform('check', {
        method: 'POST',
        body: formData
      });

      return result;
    } catch (error) {
      clientLogger?.error('scanImage fehlgeschlagen', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  async function scanBatch(buffer, mimeType) {
    if (disabled) return { ok: false, disabled: true };
    try {
      const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
      const result = await perform('batch', {
        method: 'POST',
        body: blob,
        headers: { 'Content-Type': blob.type }
      });
      return result;
    } catch (error) {
      clientLogger?.error('scanBatch fehlgeschlagen', { error: error.message });
      return { ok: false, error: error.message };
    }
  }

  async function getStats() {
    return perform('stats', { method: 'GET' });
  }

  return {
    ensureToken,
    scanImage,
    scanBatch,
    getStats,
    isEnabled: () => !disabled
  };
};
