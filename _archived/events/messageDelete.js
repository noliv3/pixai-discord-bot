// /events/messageDelete.js

const { handleMessageDelete } = require('../lib/handleMessageDelete');

module.exports = {
    name: 'messageDelete',
    async execute(message, client) {
        try {
            handleMessageDelete(message, client);
        } catch (err) {
            console.error('[messageDelete] Error:', err);
        }
    }
};
