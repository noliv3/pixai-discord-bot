module.exports = function registerEventStop(api) {
  const { registerCommand, eventStore } = api;

  registerCommand({
    name: 'eventstop',
    description: 'Beendet das aktuelle Event in diesem Kanal.',
    requiredPermissions: ['ADMIN'],
    usage: '!eventstop [Grund]',
    async execute(context) {
      const { message, args } = context;
      const reason = args.join(' ') || 'manuell beendet';
      const event = eventStore.stopEvent(message.channelId, reason);
      if (!event) {
        await message.reply('In diesem Kanal läuft kein Event.');
        return;
      }
      context.client.activeEvents.delete(message.channelId);
      await message.reply(`Event **${event.name}** wurde beendet. Es wurden ${event.stats.uploads} Uploads registriert.`);
    }
  });
};
