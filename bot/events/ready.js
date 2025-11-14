module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    client.logger.info(`Bot eingeloggt als ${client.user.tag}`);
    const guildSummaries = client.guilds.cache.map((guild) => ({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount
    }));
    client.logger.info('Verbunden mit Guilds', { guilds: guildSummaries });

    for (const guild of client.guilds.cache.values()) {
      const config = client.guildConfigs.get(guild.id);
      if (!config) {
        client.logger.warn('Keine spezifische Konfiguration für Guild gefunden', { guildId: guild.id });
        continue;
      }
      const missing = [];
      if (!config.modChannelId) missing.push('modChannelId');
      if (!config.logChannelId) missing.push('logChannelId');
      if (config.scan?.enabled && typeof config.scan.flagThreshold !== 'number') missing.push('scan.flagThreshold');
      if (config.scan?.enabled && typeof config.scan.deleteThreshold !== 'number') missing.push('scan.deleteThreshold');
      if (missing.length > 0) {
        client.logger.warn('Guild-Konfiguration unvollständig', { guildId: guild.id, missing });
      }
    }
  }
};
