function resolveModerationKey(emoji, moduleConfig) {
  const map = moduleConfig?.moderationEmojis || {};
  for (const [key, value] of Object.entries(map)) {
    if (!value) continue;
    if (value === emoji.name || value === emoji.id) return key;
  }
  return null;
}

module.exports = function registerGuardReactionAdd(api) {
  const { registerEventHandler, flaggedStore, eventStore, logger } = api;

  registerEventHandler('messageReactionAdd', async ({ args, moduleConfig }) => {
    const [reaction, user] = args;
    if (!moduleConfig?.enabled) return;
    const message = reaction.message;
    if (eventStore.isEventChannel(message.channelId)) return;
    const key = resolveModerationKey(reaction.emoji, moduleConfig);
    if (!key) return;

    const flagged = flaggedStore.get(message.id);
    if (!flagged) return;

    flaggedStore.upsert({
      ...flagged,
      status: key,
      moderatorId: user.id
    });

    if (key === 'remove') {
      try {
        await message.delete();
      } catch (error) {
        logger?.error?.('Konnte Nachricht nicht löschen', { error: error.message });
      }
    }
  });
};
