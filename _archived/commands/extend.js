module.exports = {
    name: 'extend',

    async execute(message, client, args) {
        const cmdArgs = message.content.trim().split(' ').slice(1);
        const eventName = cmdArgs[0];
        const value = parseInt(cmdArgs[1]);

        if (!eventName || isNaN(value)) {
            return message.reply({ content: '❌ Usage: `!extend <eventname> <+/-hours>`', ephemeral: true });
        }

        const activeEvents = client.activeEvents;

        if (!activeEvents) {
            return message.reply({ content: '❌ Keine aktiven Events vorhanden.', ephemeral: true });
        }

        const entry = [...activeEvents.entries()].find(([, evt]) => evt.name === eventName);

        if (!entry) {
            return message.reply({ content: `❌ No active event found with name \`${eventName}\`.`, ephemeral: true });
        }

        const [channelId, event] = entry;

        if (event.remainingTimeout) {
            clearTimeout(event.remainingTimeout);
        }

        const msChange = value * 60 * 60 * 1000;
        event.end_time += msChange;
        const newRemaining = event.end_time - Date.now();

        event.remainingTimeout = setTimeout(async () => {
            const entryCount = event.entries.length;
            const userCount = event.users.size;
            const channel = client.channels.cache.get(channelId);

            if (channel) {
                await channel.send(`🛑 **Event "${event.name}" ended!**\n✅ ${entryCount} entries by ${userCount} users.`);
            }

            const createStatsJson = require('../lib/createStatsJson');
            await createStatsJson(event, client);

            activeEvents.delete(channelId);
        }, newRemaining);

        const endUnix = Math.floor(event.end_time / 1000);
        const verb = value > 0 ? 'extended' : 'shortened';

        await message.reply({
            content: `✅ Event "${event.name}" ${verb} by \`${value}h\`. New end time: <t:${endUnix}:f>`,
            ephemeral: true
        });
    }
};
