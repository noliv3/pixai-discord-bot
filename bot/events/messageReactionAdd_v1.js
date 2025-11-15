const scanCore = require('../lib/scanCore_v1');
const modReview = require('../lib/modReview_v1');

const PUBLIC_SCAN_EMOJIS = new Set(['?', '❓']);

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user, client) {
    const message = reaction.message;
    if (!message?.guild) return;

    const configManager = client.configManager;
    const globalConfig = configManager.getGlobalConfig();
    const guildConfig = configManager.getGuildConfig(message.guild.id);

    const handled = await modReview.handleReviewReaction({
      reaction,
      user,
      client,
      guildConfig,
      flaggedStore: client.flaggedStore,
      logger: client.logger
    });
    if (handled) return;

    if (!PUBLIC_SCAN_EMOJIS.has(reaction.emoji.name)) return;
    if (!guildConfig?.scan?.enabled) return;
    if (!client.scanner?.isEnabled?.()) return;

    try {
      const scanResult = await scanCore.publicScan(message, {
        message,
        client,
        scanner: client.scanner,
        guildConfig,
        globalConfig,
        logger: client.logger
      });
      if (!scanResult) return;
      if (scanResult.summary.action === 'ignore' && scanResult.summary.highestRisk <= 0) return;
      await message.channel.send({ embeds: [scanResult.embed] });
    } catch (error) {
      client.logger?.warn('Öffentlicher Scan via Reaction fehlgeschlagen', {
        messageId: message.id,
        error: error.message
      });
    }
  }
};
