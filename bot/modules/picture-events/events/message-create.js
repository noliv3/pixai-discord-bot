function isMediaAttachment(attachment) {
  if (!attachment?.contentType) {
    return /\.(png|jpe?g|gif|webp|mp4|mov)$/i.test(attachment.name || '');
  }
  return attachment.contentType.startsWith('image/') || attachment.contentType.startsWith('video/');
}

function extractScanMeta(message, thresholds) {
  const results = message._pixai?.scanResults;
  if (!Array.isArray(results) || results.length === 0) return null;
  return {
    flagged: results.some((entry) => entry.scan.flagged || entry.scan.risk >= (thresholds?.flag ?? Infinity)),
    delete: results.some((entry) => entry.scan.remove || entry.scan.risk >= (thresholds?.delete ?? Infinity)),
    results: results.map((entry) => ({
      attachment: entry.attachment.name,
      risk: entry.scan.risk,
      tags: entry.scan.tags,
      status: entry.scan.status
    }))
  };
}

module.exports = function registerPictureEventMessage(api) {
  const { registerEventHandler, eventStore, logger } = api;

  registerEventHandler('messageCreate', async ({ args, moduleConfig, guildConfig }) => {
    const [message] = args;
    if (!moduleConfig?.enabled) return;
    if (!eventStore.isEventChannel(message.channelId)) return;

    const attachments = Array.from(message.attachments.values()).filter(isMediaAttachment);
    if (attachments.length === 0) return;

    try {
      const attachmentMeta = attachments.map((attachment) => ({
        name: attachment.name,
        url: attachment.url,
        size: attachment.size,
        contentType: attachment.contentType
      }));
      const thresholds = moduleConfig.thresholds || guildConfig?.scan?.thresholds;
      const scanMeta = extractScanMeta(message, thresholds);
      const record = eventStore.registerUpload(message, attachmentMeta, { scan: scanMeta });
      api.client.activeEvents.set(message.channelId, api.eventStore.getEvent(message.channelId));
      logger?.info?.('Event Upload registriert', { messageId: message.id, channelId: message.channelId });
      if (moduleConfig.autoReactEmoji) {
        try {
          await message.react(moduleConfig.autoReactEmoji);
        } catch (error) {
          logger?.debug?.('Automatische Reaction für Event Upload fehlgeschlagen', { error: error.message });
        }
      }
      return record;
    } catch (error) {
      logger?.warn?.('Event Upload konnte nicht registriert werden', { error: error.message });
      await message.reply(error.message);
    }
  });
};
