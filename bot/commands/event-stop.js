module.exports = {
  name: 'eventstop',
  description: 'Beendet das aktuelle Event in diesem Kanal.',
  requiredPermissions: ['ADMIN'],
  usage: '!eventstop [Grund]',
  async execute(message, args, client) {
    const reason = args.join(' ') || 'manuell beendet';
    const event = client.eventStore.stopEvent(message.channelId, reason);
    if (!event) {
      await message.reply('In diesem Kanal läuft kein Event.');
      return;
    }
    client.activeEvents.delete(message.channelId);
    await message.reply(`Event **${event.name}** wurde beendet. Es wurden ${event.stats.uploads} Uploads registriert.`);
  }
};
