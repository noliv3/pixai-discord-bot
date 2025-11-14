const path = require('path');
const fs = require('fs');
const createStatsJson = require('../lib/createStatsJson');
const scannerConfig = require('../lib/scannerConfig');

module.exports = {
    name: 'stop',

    async execute(message, client, args) {
        const channelId = message.channel.id;
        const activeEvents = client.activeEvents;

        if (!activeEvents || !activeEvents.has(channelId)) {
            return message.reply('❌ No active event in this channel.');
        }

        const event = activeEvents.get(channelId);
        const allFiles = fs.readdirSync(event.folder).filter(f =>
            ['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(f).toLowerCase())
        );

        const topEntries = allFiles
            .map(filename => {
                const match = filename.match(/_rate(\d+)_/);
                const score = match ? parseInt(match[1]) : 0;
                return { filename, score };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        const resultText = [
            `📊 **Top 10 Results for Event "${event.name}"**\n`,
            ...topEntries.map((e, i) => `#${i + 1} – \`${e.filename}\` (⭐ ${e.score})`)
        ].join('\n');

        const modChannelId = scannerConfig.get().moderatorChannelId || null;
        let target;

        if (modChannelId) {
            target = client.channels.cache.get(modChannelId);
        }

        if (!target || !target.send) {
            try {
                target = await message.author.createDM();
                await target.send(resultText);
                await message.reply('📬 Toplist sent to you via DM.');
            } catch (err) {
                await message.reply('⚠️ Could not send DM.');
                console.error(err);
            }
        } else {
            await target.send(resultText);
            await message.reply('✅ Toplist sent to the moderation channel.');
        }

        await createStatsJson(event, client);

        activeEvents.delete(channelId);
    }
};
