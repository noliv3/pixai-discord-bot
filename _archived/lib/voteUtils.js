const fs = require('fs');
const path = require('path');

/**
 * Add a vote for an entry and update its filename with the new score.
 *
 * @param {Object} entry Entry object containing filename and reactionUsers set
 * @param {string} userId Discord user ID of the voter
 * @param {Object} event Event data containing the folder path
 */
function addVote(entry, userId, event) {
    if (!entry || !event || !event.folder) return;
    if (entry.reactionUsers.has(userId)) return;

    entry.reactionUsers.add(userId);
    updateFilename(entry, event);
}

/**
 * Remove a vote for an entry and update its filename with the new score.
 *
 * @param {Object} entry Entry object containing filename and reactionUsers set
 * @param {string} userId Discord user ID of the voter
 * @param {Object} event Event data containing the folder path
 */
function removeVote(entry, userId, event) {
    if (!entry || !event || !event.folder) return;
    if (!entry.reactionUsers.has(userId)) return;

    entry.reactionUsers.delete(userId);
    updateFilename(entry, event);
}

function updateFilename(entry, event) {
    const oldPath = path.join(event.folder, entry.filename);
    const newScore = entry.reactionUsers.size;
    const newFilename = entry.filename.replace(/_rate\d+_/, `_rate${newScore}_`);
    const newPath = path.join(event.folder, newFilename);

    if (newFilename === entry.filename) return;

    try {
        fs.renameSync(oldPath, newPath);
        entry.filename = newFilename;
    } catch (err) {
        console.error('Failed to rename file:', err.message);
    }
}

module.exports = { addVote, removeVote };
