function isScannableAttachment(attachment) {
  if (!attachment?.contentType) {
    return /\.(png|jpe?g|gif|webp|mp4|mov)$/i.test(attachment.name || '');
  }
  return attachment.contentType.startsWith('image/') || attachment.contentType.startsWith('video/');
}

function requiresBatchScan(attachment) {
  const name = (attachment?.name || '').toLowerCase();
  const contentType = (attachment?.contentType || '').toLowerCase();
  if (contentType.startsWith('video/')) return true;
  if (contentType === 'image/gif') return true;
  if (/\.(gif|webm|mp4|mov)$/i.test(name)) return true;
  return false;
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
      try {
        const useBatch = requiresBatchScan(attachment);
        const scanResult = useBatch
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
