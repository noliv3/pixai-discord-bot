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
      const config = client.configManager.ensureGuildConfig(guild.id);
      const modules = Object.entries(config.modules || {}).map(([name, cfg]) => ({
        name,
        enabled: cfg?.enabled !== false
      }));
      client.logger.debug('Guild-Konfiguration geladen', {
        guildId: guild.id,
        modules,
        scanEnabled: config.scan?.enabled,
        scanThresholds: config.scan?.thresholds
      });
    }
  }
};
