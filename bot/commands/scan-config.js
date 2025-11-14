const { saveConfig } = require('../lib/botConfig');

module.exports = {
  name: 'setscan',
  description: 'Passt die Schwellenwerte für den Scanner an.',
  requiredPermissions: ['ADMIN'],
  usage: '!setscan <flagThreshold> <deleteThreshold>',
  async execute(message, args, client, guildConfig) {
    if (args.length < 2) {
      await message.reply('Bitte gib zwei Schwellenwerte an, z. B. `!setscan 0.6 0.95`.');
      return;
    }
    const flagThreshold = Number.parseFloat(args[0]);
    const deleteThreshold = Number.parseFloat(args[1]);
    if (!Number.isFinite(flagThreshold) || !Number.isFinite(deleteThreshold)) {
      await message.reply('Ungültige Zahlenwerte.');
      return;
    }

    const guildId = message.guildId;
    client.config.guilds = client.config.guilds || {};
    client.config.guilds[guildId] = client.config.guilds[guildId] || {};
    client.config.guilds[guildId].scan = {
      ...(client.config.guilds[guildId].scan || {}),
      flagThreshold,
      deleteThreshold
    };

    client.guildConfigs.set(guildId, {
      ...guildConfig,
      scan: {
        ...(guildConfig.scan || {}),
        flagThreshold,
        deleteThreshold
      }
    });

    try {
      saveConfig(client.config);
      await message.reply(`Schwellenwerte aktualisiert: Flag ${flagThreshold.toFixed(2)}, Delete ${deleteThreshold.toFixed(2)}.`);
    } catch (error) {
      client.logger.error('Speichern der Konfiguration fehlgeschlagen', { error: error.message });
      await message.reply('Konfiguration konnte nicht gespeichert werden.');
    }
  }
};
