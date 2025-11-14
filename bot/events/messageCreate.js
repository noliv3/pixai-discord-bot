const { mergeGuildConfig } = require('../lib/botConfig');
const { canUseCommand } = require('../lib/permissions');

function isScannableAttachment(attachment) {
  if (!attachment?.contentType) {
    return /\.(png|jpe?g|gif|webp|mp4|mov)$/i.test(attachment.name || '');
  }
  return attachment.contentType.startsWith('image/') || attachment.contentType.startsWith('video/');
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

async function executeCommand(message, args, client, guildConfig, command) {
  try {
    await command.execute(message, args, client, guildConfig);
  } catch (error) {
    client.logger.error('Fehler beim Ausführen eines Commands', {
      command: command.name,
      error: error.message
    });
    await message.reply('Beim Ausführen des Befehls ist ein Fehler aufgetreten.');
  }
}

async function scanAttachments(message, attachments, client, guildConfig) {
  const results = [];
  for (const attachment of attachments) {
    try {
      const response = await fetch(attachment.url, {
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) {
        client.logger.warn('Attachment konnte nicht geladen werden', { status: response.status, url: attachment.url });
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const scanResult = await client.scanner.scanImage(buffer, attachment.name, attachment.contentType);
      const parsed = parseScanResult(scanResult);
      results.push({ attachment, scan: parsed });
      if (!guildConfig?.scan?.enabled) continue;
      const risk = parsed.risk;
      const flagThreshold = guildConfig.scan.flagThreshold ?? Number.POSITIVE_INFINITY;
      const deleteThreshold = guildConfig.scan.deleteThreshold ?? Number.POSITIVE_INFINITY;
      if (risk >= deleteThreshold) {
        client.flaggedStore.upsert({
          messageId: message.id,
          guildId: message.guildId,
          channelId: message.channelId,
          userId: message.author.id,
          status: 'delete',
          risk,
          attachment: attachment.url,
          tags: parsed.tags
        });
        client.logger.warn('Upload überschreitet Delete-Threshold', { messageId: message.id, risk });
      } else if (risk >= flagThreshold) {
        client.flaggedStore.upsert({
          messageId: message.id,
          guildId: message.guildId,
          channelId: message.channelId,
          userId: message.author.id,
          status: 'flag',
          risk,
          attachment: attachment.url,
          tags: parsed.tags
        });
        client.logger.info('Upload markiert zur Moderation', { messageId: message.id, risk });
      }
    } catch (error) {
      client.logger.error('Fehler beim Scannen eines Attachments', { error: error.message });
    }
  }
  return results;
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;

    const prefix = client.config.bot.prefix || '!';
    if (message.content.startsWith(prefix)) {
      const raw = message.content.slice(prefix.length).trim();
      const [commandName, ...args] = raw.split(/\s+/);
      if (!commandName) return;
      const command = client.commands.get(commandName.toLowerCase());
      if (!command) return;
      const guildConfig = message.guild
        ? client.guildConfigs.get(message.guild.id) || mergeGuildConfig(client.config, message.guild.id)
        : null;
      if (message.guild && guildConfig) {
        client.guildConfigs.set(message.guild.id, guildConfig);
      }
      if (!canUseCommand(message, command, client.config, guildConfig)) {
        await message.reply('Du hast keine Berechtigung für diesen Befehl.');
        return;
      }
      await executeCommand(message, args, client, guildConfig, command);
      return;
    }

    if (!message.guild) return;

    const guildConfig = client.guildConfigs.get(message.guild.id) || mergeGuildConfig(client.config, message.guild.id);
    client.guildConfigs.set(message.guild.id, guildConfig);

    const scannableAttachments = Array.from(message.attachments.values()).filter(isScannableAttachment);
    let scanResults = [];
    if (guildConfig?.scan?.enabled && scannableAttachments.length > 0 && client.scanner.isEnabled()) {
      scanResults = await scanAttachments(message, scannableAttachments, client, guildConfig);
    }

    if (client.eventStore.isEventChannel(message.channelId) && scannableAttachments.length > 0) {
      try {
        const attachmentsMeta = scannableAttachments.map((attachment) => ({
          name: attachment.name,
          url: attachment.url,
          size: attachment.size,
          contentType: attachment.contentType
        }));
        const scanMeta = scanResults.length > 0 ? {
          flagged: scanResults.some((entry) => entry.scan.remove || entry.scan.risk >= (guildConfig.scan?.flagThreshold ?? Infinity)),
          delete: scanResults.some((entry) => entry.scan.remove || entry.scan.risk >= (guildConfig.scan?.deleteThreshold ?? Infinity)),
          results: scanResults.map((entry) => ({
            attachment: entry.attachment.name,
            risk: entry.scan.risk,
            tags: entry.scan.tags,
            status: entry.scan.status
          }))
        } : null;
        const event = client.eventStore.registerUpload(message, attachmentsMeta, { scan: scanMeta });
        client.activeEvents.set(message.channelId, event);
      } catch (error) {
        client.logger.warn('Event Upload konnte nicht registriert werden', { error: error.message });
        await message.reply(error.message);
      }
    }
  }
};
