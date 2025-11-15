const scanCore = require('../../../lib/scanCore_v1');
const modReview = require('../../../lib/modReview_v1');

module.exports = function registerMessageCreate(api) {
  const { registerEventHandler, client, scanner, flaggedStore, logger } = api;

  registerEventHandler('messageCreate', async ({ args, guildId, guildConfig, globalConfig, moduleConfig }) => {
    const [message] = args;
    if (!message?.guild) return;
    if (moduleConfig?.enabled === false) return;
    if (!guildConfig?.scan?.enabled) return;
    if (!scanner?.isEnabled?.()) return;

    try {
      const scanResult = await scanCore.scanMessage({
        message,
        client,
        scanner,
        guildConfig,
        globalConfig,
        logger
      });
      if (!scanResult) return;
      await modReview.handleScanOutcome({
        message,
        scanResult,
        client,
        guildConfig,
        flaggedStore,
        logger
      });
    } catch (error) {
      logger?.error?.('Fehler beim automatischen Scan', {
        messageId: message.id,
        guildId,
        error: error.message
      });
    }
  });
};
