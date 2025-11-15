const modReview = require('../../../lib/modReview_v1');

module.exports = function registerReactionRemove(api) {
  const { registerEventHandler, client, flaggedStore, logger } = api;

  registerEventHandler('messageReactionRemove', async ({ args, guildId, guildConfig, moduleConfig }) => {
    const [reaction, user] = args;
    const message = reaction?.message;
    if (!message?.guild) return;
    if (moduleConfig?.enabled === false) return;

    await modReview.handleReviewReactionRemove({
      reaction,
      user,
      client,
      guildConfig,
      flaggedStore,
      logger
    });
  });
};
