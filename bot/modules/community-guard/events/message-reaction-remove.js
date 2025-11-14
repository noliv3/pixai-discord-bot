function resolveModerationKey(emoji, moduleConfig) {
  const map = moduleConfig?.moderationEmojis || {};
  for (const [key, value] of Object.entries(map)) {
    if (!value) continue;
    if (value === emoji.name || value === emoji.id) return key;
  }
  return null;
}

module.exports = function registerGuardReactionRemove(api) {
  const { registerEventHandler, flaggedStore, eventStore } = api;

  registerEventHandler('messageReactionRemove', async ({ args, moduleConfig }) => {
    const [reaction] = args;
    if (!moduleConfig?.enabled) return;
    const message = reaction.message;
    if (eventStore.isEventChannel(message.channelId)) return;
    const key = resolveModerationKey(reaction.emoji, moduleConfig);
    if (!key) return;

    const flagged = flaggedStore.get(message.id);
    if (!flagged) return;

    flaggedStore.upsert({
      ...flagged,
      status: 'flag',
      moderatorId: null
    });
  });
};
