module.exports = {
  name: 'guildCreate',
  async execute(guild, client) {
    const config = client.configManager.ensureGuildConfig(guild.id);
    client.logger.info('Guild beigetreten', {
      guildId: guild.id,
      name: guild.name,
      modules: Object.keys(config.modules || {})
    });
  }
};
