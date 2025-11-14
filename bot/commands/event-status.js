const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'eventstatus',
  description: 'Zeigt aktive Events auf dem Server an.',
  requiredPermissions: ['MOD'],
  usage: '!eventstatus',
  async execute(message, args, client) {
    const events = client.eventStore.listActiveEvents().filter((event) => event.guildId === message.guildId);
    if (events.length === 0) {
      await message.reply('Aktuell laufen keine Events.');
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle('Aktive Events')
      .setColor(0x5865f2)
      .setTimestamp(new Date());
    for (const event of events) {
      embed.addFields({
        name: `${event.name} – <#${event.channelId}>`,
        value: `Uploads: **${event.uploads}** | Votes: **${event.votes}**\nEndet: ${event.endsAt || 'offen'}`
      });
    }
    await message.reply({ embeds: [embed] });
  }
};
