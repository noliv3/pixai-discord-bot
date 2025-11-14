const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');
const modLog = path.join(logDir, 'mod_review.log');

function logModReview(entry) {
    try {
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const ts = new Date().toISOString();
        fs.appendFileSync(modLog, `${ts} ${entry}\n`);
    } catch (err) {
        console.warn('[modLogger] Failed to write log:', err.message);
    }
}

module.exports = { logModReview };
