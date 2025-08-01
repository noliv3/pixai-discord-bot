// /lib/scan.js (robuste Version mit Retry + User-Agent)
const axios = require('axios');
const FormData = require('form-data');
const scannerConfig = require('./scannerConfig');

function isFrameMedia(url) {
  return /\.(gif|webm|mp4)$/i.test(url.split('?')[0]);
}

async function postToScanner(endpoint, buffer, cfg) {
  const { authHeader, multipartField } = cfg;
  let data, headers;

  if (multipartField) {
    const form = new FormData();
    form.append(multipartField, buffer, {
      filename: 'upload' + (isFrameMedia(endpoint) ? '.bin' : '.jpg'),
      contentType: 'application/octet-stream',
    });
    data = form;
    headers = form.getHeaders();
  } else {
    data = buffer;
    headers = { 'Content-Type': 'application/octet-stream' };
  }

  if (authHeader) headers.Authorization = authHeader;

  const res = await axios.post(endpoint, data, {
    headers,
    maxBodyLength: 50 * 1024 * 1024,
    maxContentLength: 50 * 1024 * 1024,
    timeout: 60000
  });

  return res.data || null;
}

async function tryDownloadImage(url, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DiscordBot/1.0)',
          'Accept': 'image/*,*/*;q=0.8'
        }
      });
      return response.data;
    } catch (e) {
      lastError = e;
      console.warn(`Download attempt ${i + 1} failed:`, e.message);
    }
  }
  console.error('Download failed after retries:', lastError?.message);
  return null;
}

async function scanImage(url) {
  const cfg = scannerConfig.get();
  if (!cfg.scannerApiUrl) {
    console.warn('scannerApiUrl not set');
    return null;
  }

  cfg.multipartField = isFrameMedia(url) ? 'file' : 'image';

  const file = await tryDownloadImage(url);
  if (!file) return null;

  const base = cfg.scannerApiUrl.replace(/\/check$/i, '');
  const endpoint = isFrameMedia(url) ? `${base}/batch` : cfg.scannerApiUrl;

  try {
    return await postToScanner(endpoint, file, cfg);
  } catch (e) {
    console.error('Scan request failed:', e.message);
    return null;
  }
}

async function scanBuffer(buffer, { isFrame = false } = {}) {
  const cfg = scannerConfig.get();
  if (!cfg.scannerApiUrl) return null;

  cfg.multipartField = isFrame ? 'file' : 'image';

  const base = cfg.scannerApiUrl.replace(/\/check$/i, '');
  const endpoint = isFrame ? `${base}/batch` : cfg.scannerApiUrl;

  try {
    return await postToScanner(endpoint, buffer, cfg);
  } catch (e) {
    console.error('Scan request failed:', e.message);
    return null;
  }
}

module.exports = { scanImage, scanBuffer, isFrameMedia };
