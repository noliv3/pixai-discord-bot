const fs = require('fs/promises');
const path = require('path');

/**
 * Generate a statistics file for a finished event.
 *
 * @param {Object} event The event data object.
 * @param {Object} client Discord client instance (unused but kept for future extensions).
 * @returns {Object|null} Collected statistics or null on error.
 */
module.exports = async function createStatsJson(event, client) {
    if (!event || !event.folder) return null;

    try {
        const stats = {
            name: event.name,
            start_time: event.start_time,
            end_time: event.end_time,
            entry_count: event.entries.length,
            participants: event.users.size,
            total_votes: 0,
            top_entries: []
        };

        const entryStats = event.entries.map(e => {
            const votes = e.reactionUsers ? e.reactionUsers.size : 0;
            stats.total_votes += votes;
            return {
                filename: e.filename,
                user_id: e.userId,
                message_id: e.messageId,
                votes
            };
        });

        entryStats.sort((a, b) => b.votes - a.votes);
        stats.top_entries = entryStats.slice(0, 10);
        stats.entries = entryStats;

        const filePath = path.join(event.folder, `${event.name}.json`);
        await fs.writeFile(filePath, JSON.stringify(stats, null, 4));

        return stats;
    } catch (err) {
        console.error('Failed to create stats JSON:', err.message);
        return null;
    }
};
