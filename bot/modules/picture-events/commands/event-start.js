module.exports = function registerEventStart(api) {
  const { registerCommand, eventStore, logger } = api;

  registerCommand({
    name: 'eventstart',
    description: 'Startet ein neues Bildevent im aktuellen Kanal.',
    requiredPermissions: ['ADMIN'],
    usage: '!eventstart <name> [dauer_stunden] [max_uploads]',
    async execute(context) {
      const { message, args, guildId, moduleConfig } = context;
      if (!guildId) {
        await message.reply('Dieser Befehl kann nur innerhalb einer Guild verwendet werden.');
        return;
      }
      if (!moduleConfig?.enabled) {
        await message.reply('Events sind für diese Guild deaktiviert.');
        return;
      }
      const name = args[0];
      if (!name) {
        await message.reply('Bitte gib einen internen Event-Namen an.');
        return;
      }
      const durationHours = Number.parseInt(args[1] ?? moduleConfig.defaultDurationHours ?? 24, 10);
      const maxEntries = Number.parseInt(args[2] ?? moduleConfig.maxEntriesPerUser ?? 3, 10);
      const hours = Number.isFinite(durationHours) ? Math.max(durationHours, 1) : 24;
      const limit = Number.isFinite(maxEntries) ? Math.max(maxEntries, 1) : null;
      const endsAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

      try {
        const event = eventStore.startEvent(message.channelId, {
          name,
          guildId,
          createdBy: message.author.id,
          endsAt,
          maxEntries: limit
        });
        context.client.activeEvents.set(message.channelId, event);
        await message.reply(`Event **${name}** gestartet. Läuft bis ${endsAt}.`);
      } catch (error) {
        logger?.warn?.('Event konnte nicht gestartet werden', { error: error.message });
        await message.reply(`Event konnte nicht gestartet werden: ${error.message}`);
      }
    }
  });
};
