const modReview = require('../lib/modReview_v1');

module.exports = {
  name: 'messageReactionRemove',
  async execute(reaction, user, client) {
    const message = reaction.message;
    if (!message?.guild) return;

    const configManager = client.configManager;
    const guildConfig = configManager.getGuildConfig(message.guild.id);

    await modReview.handleReviewReactionRemove({
      reaction,
      user,
      client,
      guildConfig,
      flaggedStore: client.flaggedStore,
      logger: client.logger
    });
  }
};
