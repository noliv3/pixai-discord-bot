const path = require('path');
const fs = require('fs');
const createStatsJson = require('../lib/createStatsJson');

const activeEvents = new Map();

module.exports = {
    name: 'start',

    async execute(message, client, args) {
        const cmdArgs = args && args.length ? args : message.content.split(' ').slice(1);

        let eventName, durationArg, maxEntries;
        const guild = message.guild;
        const currentChannel = message.channel;

        // Zwei Varianten: !start 2 oder !start <name> <dauer> <max>
        if (cmdArgs.length === 1) {
            eventName = currentChannel.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            durationArg = cmdArgs[0];
            maxEntries = 1;
        } else if (cmdArgs.length >= 3) {
            eventName = cmdArgs[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
            durationArg = cmdArgs[1];
            maxEntries = parseInt(cmdArgs[2]);
        } else {
            return message.reply('❌ Usage: `!start <name> <duration> <max>` or `!start <duration>`');
        }

        const match = durationArg.match(/^(\d+)(h)?$/i);
        if (!match) {
            return message.reply('❌ Duration must be a number followed by "h", e.g., `2h`');
        }

        const hours = parseInt(durationArg);
        const startTime = Date.now();
        const endTime = startTime + hours * 60 * 60 * 1000;

        // Prüfe, ob Channel existiert, ansonsten erstellen
        let targetChannel = guild.channels.cache.find(c => c.name === eventName && c.type === 0);
        if (!targetChannel) {
            try {
                targetChannel = await guild.channels.create({
                    name: eventName,
                    type: 0,
                    reason: `Event: ${eventName}`,
                    permissionOverwrites: [
                        {
                            id: client.user.id,
                            allow: ['ViewChannel', 'SendMessages', 'AddReactions']
                        }
                    ]
                });
                await message.reply(`📣 Created channel <#${targetChannel.id}> for the event.`);
            } catch (err) {
                console.error('❌ Channel creation failed:', err);
                return message.reply('❌ Could not create event channel.');
            }
        }

        const channelId = targetChannel.id;

        if (activeEvents.has(channelId)) {
            return message.reply('⚠️ An event is already running in that channel.');
        }

        const eventFolder = path.join(__dirname, '..', 'event_files', eventName);
        if (!fs.existsSync(eventFolder)) {
            fs.mkdirSync(eventFolder, { recursive: true });
        }

        const timeout = setTimeout(async () => {
            if (activeEvents.has(channelId)) {
                const event = activeEvents.get(channelId);
                const entryCount = event.entries.length;
                const userCount = event.users.size;

                await targetChannel.send(`🛑 **Event "${event.name}" ended!**\n✅ ${entryCount} entries by ${userCount} users.`);

                await createStatsJson(event, client);
                activeEvents.delete(channelId);
            }
        }, hours * 60 * 60 * 1000);

        activeEvents.set(channelId, {
            name: eventName,
            start_time: startTime,
            end_time: endTime,
            folder: eventFolder,
            entries: [],
            users: new Set(),
            reactions: new Map(),
            remainingTimeout: timeout,
            channel_id: channelId,
            max_entries: maxEntries || 1
        });

        client.activeEvents = activeEvents;

        targetChannel.send(`🎉 **Event "${eventName}" started!**\nEnds in ${hours}h at <t:${Math.floor(endTime / 1000)}:f>. Max entries per user: ${maxEntries || 1}`);
    }
};
