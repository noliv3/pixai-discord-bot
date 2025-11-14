function resolveEmojiKey(emoji, moduleConfig) {
  const voteEmojis = moduleConfig?.voteEmojis || {};
  for (const [key, value] of Object.entries(voteEmojis)) {
    if (!value) continue;
    if (value === emoji.name || value === emoji.id) return key;
  }
  return null;
}

module.exports = function registerReactionAdd(api) {
  const { registerEventHandler, eventStore } = api;

  registerEventHandler('messageReactionAdd', async ({ args, moduleConfig }) => {
    const [reaction, user] = args;
    if (!moduleConfig?.enabled) return;
    const message = reaction.message;
    if (!eventStore.isEventChannel(message.channelId)) return;
    const emojiKey = resolveEmojiKey(reaction.emoji, moduleConfig);
    if (!emojiKey) return;

    eventStore.addVote(message.channelId, message.id, emojiKey, user.id);
    api.client.activeEvents.set(message.channelId, eventStore.getEvent(message.channelId));
  });
};
