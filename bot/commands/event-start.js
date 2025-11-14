module.exports = {
  name: 'eventstart',
  description: 'Startet ein neues Bildevent im aktuellen Kanal.',
  requiredPermissions: ['ADMIN'],
  usage: '!eventstart <name> [dauer_stunden] [max_uploads]',
  async execute(message, args, client, guildConfig) {
    if (!guildConfig?.event?.enabled) {
      await message.reply('Events sind für diese Guild deaktiviert.');
      return;
    }
    const name = args[0];
    if (!name) {
      await message.reply('Bitte gib einen internen Event-Namen an.');
      return;
    }
    const durationHours = Number.parseInt(args[1] ?? guildConfig.event.defaultDurationHours ?? 24, 10);
    const maxEntries = Number.parseInt(args[2] ?? guildConfig.event.maxEntriesPerUser ?? 3, 10);
    const endsAt = new Date(Date.now() + Math.max(durationHours, 1) * 3600 * 1000).toISOString();

    try {
      const event = client.eventStore.startEvent(message.channelId, {
        name,
        guildId: message.guildId,
        createdBy: message.author.id,
        endsAt,
        maxEntries
      });
      client.activeEvents.set(message.channelId, event);
      await message.reply(`Event **${name}** gestartet. Läuft bis ${endsAt}.`);
    } catch (error) {
      await message.reply(`Event konnte nicht gestartet werden: ${error.message}`);
    }
  }
};
