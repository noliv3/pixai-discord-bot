function detectScanMode(attachment) {
  const name = (attachment?.name || '').toLowerCase();
  const contentType = (attachment?.contentType || '').toLowerCase();

  if (contentType === 'image/gif') return 'batch';
  if (contentType.startsWith('video/')) return 'batch';
  if (/\.(gif|mp4|webm)$/i.test(name)) return 'batch';

  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return 'check';
  if (contentType === 'image/png') return 'check';
  if (contentType === 'image/webp') return 'check';

  if (/\.(jpe?g|png|webp)$/i.test(name)) return 'check';

  if (contentType.startsWith('image/')) {
    if (contentType.includes('jpeg') || contentType.includes('png') || contentType.includes('webp')) {
      return 'check';
    }
  }

  return null;
}

function isScannableAttachment(attachment) {
  return Boolean(detectScanMode(attachment));
}

function parseScanResult(result) {
  if (!result || !result.ok) {
    return { status: 'error', flagged: false, remove: false, risk: 0, tags: [], raw: result?.data ?? null };
  }
  const data = result.data || {};
  const scores = data.scores || data.score || {};
  let risk = Number.isFinite(data.risk) ? data.risk : 0;
  if (!risk && typeof scores === 'object') {
    for (const value of Object.values(scores)) {
      const numeric = Number.parseFloat(value);
      if (!Number.isNaN(numeric)) {
        risk += numeric;
      }
    }
  }
  const tags = Array.isArray(data.tags) ? data.tags : [];
  return {
    status: 'ok',
    flagged: Boolean(data.flagged ?? risk > 0),
    remove: Boolean(data.delete ?? false),
    risk,
    tags,
    raw: data
  };
}

module.exports = function registerMessageCreate(api) {
  const { registerEventHandler, scanner, logger } = api;

  registerEventHandler('messageCreate', async ({ args, guildConfig, moduleConfig }) => {
    const [message] = args;
    if (!moduleConfig || moduleConfig.enabled === false) return;
    if (!guildConfig?.scan?.enabled) return;
    if (!scanner?.isEnabled?.()) return;
    if (Array.isArray(message._pixai?.scanResults)) return;
    if (!message?.attachments?.size) return;

    const attachments = Array.from(message.attachments.values()).filter(isScannableAttachment);
    if (attachments.length === 0) return;

    const results = [];
    for (const attachment of attachments) {
      const mode = detectScanMode(attachment);
      if (!mode) continue;

      try {
        const scanResult = mode === 'batch'
          ? await scanner.batchFromUrl(attachment.url, {
              filename: attachment.name,
              contentType: attachment.contentType
            })
          : await scanner.checkImageFromUrl(attachment.url, {
              filename: attachment.name,
              contentType: attachment.contentType
            });
        const parsed = parseScanResult(scanResult);
        results.push({ attachment, scan: parsed });
      } catch (error) {
        logger?.error?.('Fehler beim Scannen eines Attachments', { error: error.message });
      }
    }

    if (results.length === 0) return;

    if (!message._pixai) {
      Object.defineProperty(message, '_pixai', {
        value: {},
        configurable: true
      });
    }
    message._pixai.scanResults = results;
  });
};
