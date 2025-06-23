const fs = require('fs');
const path = require('path');
const CONFIG_PATH = path.join(__dirname, '..', 'scanner-config.json');

function load() {
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed.tagFilters) {
            return { "0": [], "1": [], "2": [], "3": [] };
        }
        return parsed.tagFilters;
    } catch (err) {
        console.error('Failed to read tag filters:', err.message);
        return { "0": [], "1": [], "2": [], "3": [] };
    }
}

module.exports = {
    getFilters: load
};
