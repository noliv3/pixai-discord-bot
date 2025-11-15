const fs = require('fs');
const path = require('path');

const USER_AGENT = 'PixAI-DiscordBot/2.0 (+https://pixai.ai)';

async function downloadAttachment(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || null;
  return { buffer, contentType, finalUrl: response.url || url };
}

async function saveEventAttachment(url, filename, folder, logger) {
  try {
    fs.mkdirSync(folder, { recursive: true });
    const { buffer } = await downloadAttachment(url);
    const filePath = path.join(folder, filename);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (error) {
    logger?.warn?.('Konnte Event-Attachment nicht speichern', { url, error: error.message });
    return null;
  }
}

module.exports = {
  downloadAttachment,
  saveEventAttachment
};
