const { EmbedBuilder } = require('discord.js');
const path = require('path');

module.exports = {
    name: 'eventstats',

    async execute(message, client, args) {
        const activeEvents = client.activeEvents;

        if (!activeEvents || activeEvents.size === 0) {
            return message.reply('📭 No active events currently running.');
        }

        const embed = new EmbedBuilder()
            .setTitle('📊 Active Event Stats')
            .setColor(0x00AE86)
            .setTimestamp();

        for (const [channelId, event] of activeEvents.entries()) {
            const channel = client.channels.cache.get(channelId);
            const remainingMs = event.end_time - Date.now();
            const remainingHours = (remainingMs / (1000 * 60 * 60)).toFixed(2);
            const endUnix = Math.floor(event.end_time / 1000);
            const startUnix = Math.floor((event.start_time || Date.now()) / 1000);

            embed.addFields({
                name: `#${channel ? channel.name : 'unknown'} (${event.name})`,
                value:
                    `• Entries: \`${event.entries.length}\`\n` +
                    `• Participants: \`${event.users.size}\`\n` +
                    `• Ends in: \`${remainingHours}h\`\n` +
                    `• End time: <t:${endUnix}:f>\n` +
                    `• Started: <t:${startUnix}:R>`
            });
        }

        await message.reply({ embeds: [embed] });
    }
};
