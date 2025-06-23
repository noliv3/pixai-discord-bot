// /events/messageCreate.js

const messageHandler = require('../lib/handleMessageCreate');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        try {
            await messageHandler.execute(message, client);
        } catch (err) {
            console.error('[messageCreate] Error:', err);
        }
    }
};
