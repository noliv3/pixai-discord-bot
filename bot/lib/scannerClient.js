import { Blob } from 'node:buffer';
import { setTimeout as delay } from 'node:timers/promises';

let cachedToken = null;
let tokenExpires = 0;

export async function ensureToken(scannerConfig) {
  const now = Date.now();
  const baseUrl = scannerConfig.baseUrl.replace(/\/+$/, '');

  if (cachedToken && now < tokenExpires) return cachedToken;

  const url = `${baseUrl}/token?email=${encodeURIComponent(scannerConfig.email)}`;
  const resp = await fetch(url, { method: 'GET' });
  if (!resp.ok) throw new Error(`Token error: ${resp.status}`);

  const text = (await resp.text()).trim();
  cachedToken = text;
  tokenExpires = now + 10 * 60 * 1000; // 10 min
  return cachedToken;
}

async function downloadAsBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed ${resp.status}`);
  const arr = new Uint8Array(await resp.arrayBuffer());
  const ct = resp.headers.get('content-type') || 'application/octet-stream';
  return { buffer: arr, mime: ct };
}

async function sendMultipart(scannerConfig, path, fieldName, buffer, mime) {
  const baseUrl = scannerConfig.baseUrl.replace(/\/+$/, '');
  let token = await ensureToken(scannerConfig);

  const form = new FormData();
  form.append(fieldName, new Blob([buffer], { type: mime }), 'upload.bin');

  async function doRequest(tk) {
    const resp = await fetch(`${baseUrl}/${path}`, {
      method: 'POST',
      headers: { Authorization: tk },
      body: form
    });
    return resp;
  }

  let resp = await doRequest(token);
  if (resp.status === 403) {
    // renew once
    const renewUrl = `${baseUrl}/token?email=${encodeURIComponent(scannerConfig.email)}&renew=1`;
    const r = await fetch(renewUrl);
    if (r.ok) {
      token = (await r.text()).trim();
      cachedToken = token;
      resp = await doRequest(token);
    }
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Scanner error ${resp.status}: ${text}`);
  }

  return await resp.json();
}

export async function checkImageFromUrl(scannerConfig, imageUrl) {
  const { buffer, mime } = await downloadAsBuffer(imageUrl);
  return sendMultipart(scannerConfig, 'check', 'image', buffer, mime);
}

export async function batchFromUrl(scannerConfig, fileUrl) {
  const { buffer, mime } = await downloadAsBuffer(fileUrl);
  return sendMultipart(scannerConfig, 'batch', 'file', buffer, mime);
}
