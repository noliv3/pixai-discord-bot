const { mergeGuildConfig } = require('../lib/botConfig');

function resolveEmojiKey(emoji, guildConfig) {
  const voteEmojis = guildConfig?.event?.voteEmojis || {};
  for (const [key, value] of Object.entries(voteEmojis)) {
    if (!value) continue;
    if (value === emoji.name || value === emoji.id) return key;
  }
  return null;
}

async function resolveMessage(reaction) {
  if (reaction.message.partial) {
    return reaction.message.fetch();
  }
  return reaction.message;
}

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user, client) {
    if (user.bot) return;

    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        client.logger.warn('Konnte Reaction nicht laden', { error: error.message });
        return;
      }
    }

    const message = await resolveMessage(reaction);
    if (!message.guild) return;

    const guildConfig = client.guildConfigs.get(message.guild.id) || mergeGuildConfig(client.config, message.guild.id);
    client.guildConfigs.set(message.guild.id, guildConfig);
    const emojiKey = resolveEmojiKey(reaction.emoji, guildConfig);
    if (!emojiKey) return;

    if (client.eventStore.isEventChannel(message.channelId)) {
      client.eventStore.addVote(message.channelId, message.id, emojiKey, user.id);
      client.activeEvents.set(message.channelId, client.eventStore.getEvent(message.channelId));
      return;
    }

    const flagged = client.flaggedStore.get(message.id);
    if (flagged) {
      client.flaggedStore.upsert({
        ...flagged,
        status: emojiKey,
        moderatorId: user.id
      });
      if (emojiKey === 'remove') {
        try {
          await message.delete();
        } catch (error) {
          client.logger.error('Konnte Nachricht nicht löschen', { error: error.message });
        }
      }
    }
  }
};
