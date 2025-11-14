module.exports = {
  name: 'eventextend',
  description: 'Verlängert oder verkürzt das aktuelle Event.',
  requiredPermissions: ['ADMIN'],
  usage: '!eventextend <+/-stunden>',
  async execute(message, args, client) {
    const value = args[0];
    if (!value || !/^[-+]?\d+$/.test(value)) {
      await message.reply('Bitte gib eine Ganzzahl an, z. B. `+2` oder `-1`.');
      return;
    }
    const hours = Number.parseInt(value, 10);
    const event = client.eventStore.updateEvent(message.channelId, (evt) => {
      const currentEnd = evt.endsAt ? new Date(evt.endsAt).getTime() : Date.now();
      const updated = new Date(currentEnd + hours * 3600 * 1000);
      evt.endsAt = updated.toISOString();
    });
    if (!event) {
      await message.reply('In diesem Kanal läuft kein Event.');
      return;
    }
    client.activeEvents.set(message.channelId, event);
    await message.reply(`Event **${event.name}** endet nun am ${event.endsAt}.`);
  }
};
