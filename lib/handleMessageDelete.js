// /lib/handleMessageDelete.js

/**
 * Handles deletion of a message. Removes the entry from an event if applicable.
 *
 * @param {Message} message
 * @param {Client} client
 */
function handleMessageDelete(message, client) {
    const channelId = message.channel?.id;
    if (!channelId || !client.activeEvents?.has(channelId)) return;

    const event = client.activeEvents.get(channelId);
    const index = event.entries.findIndex(e => e.messageId === message.id);
    if (index !== -1) {
        event.entries.splice(index, 1);
        console.log(`[event] Deleted entry from event '${event.name}' due to message removal.`);
    }
}

module.exports = { handleMessageDelete };
