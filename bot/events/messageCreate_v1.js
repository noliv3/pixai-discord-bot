const scanCore = require('../lib/scanCore_v1');
const modReview = require('../lib/modReview_v1');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (!message?.guild) return;
    if (message.author?.bot) return;

    const configManager = client.configManager;
    const globalConfig = configManager.getGlobalConfig();
    const guildConfig = configManager.getGuildConfig(message.guild.id);
    if (!guildConfig?.scan?.enabled) return;
    if (!client.scanner?.isEnabled?.()) return;

    try {
      const scanResult = await scanCore.scanMessage({
        message,
        client,
        scanner: client.scanner,
        guildConfig,
        globalConfig,
        logger: client.logger
      });
      if (!scanResult) return;
      await modReview.handleScanOutcome({
        message,
        scanResult,
        client,
        guildConfig,
        flaggedStore: client.flaggedStore,
        logger: client.logger
      });
    } catch (error) {
      client.logger?.error('Fehler beim automatischen Scan', {
        messageId: message.id,
        guildId: message.guildId,
        error: error.message
      });
    }
  }
};
