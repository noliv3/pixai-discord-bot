const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

module.exports = {
  name: 'eventexport',
  description: 'Exportiert Uploads des aktuellen Events als ZIP-Datei.',
  requiredPermissions: ['ADMIN'],
  usage: '!eventexport [topN]',
  async execute(message, args, client) {
    const event = client.eventStore.getEvent(message.channelId);
    if (!event) {
      await message.reply('In diesem Kanal läuft kein Event.');
      return;
    }
    const limit = Number.parseInt(args[0] || '0', 10);
    const uploads = Array.from(event.uploads.values());
    if (uploads.length === 0) {
      await message.reply('Es wurden keine Uploads gefunden.');
      return;
    }
    uploads.sort((a, b) => {
      const scoreA = (a.votes.approve.size || 0) - (a.votes.reject.size || 0);
      const scoreB = (b.votes.approve.size || 0) - (b.votes.reject.size || 0);
      return scoreB - scoreA;
    });
    const selected = limit > 0 ? uploads.slice(0, limit) : uploads;
    const zip = new AdmZip();

    for (const upload of selected) {
      for (const attachment of upload.attachments) {
        try {
          const response = await fetch(attachment.url, { signal: AbortSignal.timeout(20000) });
          if (!response.ok) {
            client.logger.warn('Konnte Attachment nicht herunterladen', { status: response.status, url: attachment.url });
            continue;
          }
          const buffer = Buffer.from(await response.arrayBuffer());
          const filename = `${event.name}_${upload.userId}_${upload.messageId}_${attachment.name}`;
          zip.addFile(filename, buffer);
        } catch (error) {
          client.logger.error('Fehler beim Download für ZIP-Export', { error: error.message });
        }
      }
    }

    const outDir = event.directory;
    fs.mkdirSync(outDir, { recursive: true });
    const zipPath = path.join(outDir, `${event.name}_${Date.now()}.zip`);
    zip.writeZip(zipPath);

    await message.reply({
      content: `Event-Export für **${event.name}** (${selected.length} Uploads).`,
      files: [{ attachment: zip.toBuffer(), name: path.basename(zipPath) }]
    });
  }
};
