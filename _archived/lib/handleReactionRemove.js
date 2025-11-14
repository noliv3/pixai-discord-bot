// /lib/handleReactionRemove.js

const { updateVoteCount, removeVote } = require('./voteUtils');

/**
 * Handles a removed reaction (updates event voting).
 *
 * @param {MessageReaction} reaction
 * @param {User} user
 * @param {Client} client
 */
async function handleReactionRemove(reaction, user, client) {
    if (user.bot) return;

    const message = reaction.message;
    const emoji = reaction.emoji.name;

    const event = client.activeEvents?.get(message.channel.id);
    if (!event) return;

    const entry = event.entries.find(e => e.messageId === message.id);
    if (!entry || ['?', '❓', '✅', '❌', '🔁'].includes(emoji)) return;

    removeVote(entry, user.id);
    await updateVoteCount(entry, event.folder);
}

module.exports = { handleReactionRemove };
