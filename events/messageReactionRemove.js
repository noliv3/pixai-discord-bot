// /events/messageReactionRemove.js

const { handleReactionRemove } = require('../lib/handleReactionRemove');

module.exports = {
    name: 'messageReactionRemove',
    async execute(reaction, user, client) {
        try {
            if (reaction.partial) await reaction.fetch();
            if (reaction.message.partial) await reaction.message.fetch();
            await handleReactionRemove(reaction, user, client);
        } catch (err) {
            console.error('[messageReactionRemove] Error:', err);
        }
    }
};
