const scanCore = require('../../../lib/scanCore_v1');
const modReview = require('../../../lib/modReview_v1');

module.exports = function registerReactionAdd(api) {
  const { registerEventHandler, client, scanner, flaggedStore, logger } = api;

  registerEventHandler('messageReactionAdd', async ({ args, guildId, guildConfig, globalConfig, moduleConfig }) => {
    const [reaction, user] = args;
    const message = reaction?.message;
    if (!message?.guild) return;
    if (moduleConfig?.enabled === false) return;

    const handled = await modReview.handleReviewReaction({
      reaction,
      user,
      client,
      guildConfig,
      flaggedStore,
      logger
    });
    if (handled) return;

    const publicEmojis = moduleConfig?.publicScanEmojis || [];
    if (!publicEmojis.includes(reaction.emoji.name)) return;
    if (!guildConfig?.scan?.enabled) return;
    if (!scanner?.isEnabled?.()) return;

    try {
      const scanResult = await scanCore.publicScan(message, {
        message,
        client,
        scanner,
        guildConfig,
        globalConfig,
        logger
      });
      if (!scanResult) return;
      if (scanResult.summary.action === 'ignore' && scanResult.summary.highestRisk <= 0) return;
      await message.channel.send({ embeds: [scanResult.embed] });
    } catch (error) {
      logger?.warn?.('Öffentlicher Scan via Reaction fehlgeschlagen', {
        messageId: message.id,
        guildId,
        error: error.message
      });
    }
  });
};
