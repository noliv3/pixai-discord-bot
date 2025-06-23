// /lib/scannerConfig.js

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', 'scanner-config.json');

const config = {
    scannerApiUrl: '',
    authHeader: '',
    multipartField: '',
    flagThreshold: 0.5,
    deleteThreshold: 0.9,
    moderatorRoleId: '',
    moderatorChannelId: '',
    rulesChannelId: '',
    tagFilters: { "0": [], "1": [], "2": [], "3": [] } // ← NEU: Standardstruktur
};

function load() {
    try {
        const data = fs.readFileSync(configPath, 'utf8');
        Object.assign(config, JSON.parse(data));

        // Sicherstellen, dass tagFilters korrekt vorhanden ist
        if (!config.tagFilters || typeof config.tagFilters !== 'object') {
            config.tagFilters = { "0": [], "1": [], "2": [], "3": [] };
        } else {
            for (const key of ["0", "1", "2", "3"]) {
                if (!Array.isArray(config.tagFilters[key])) {
                    config.tagFilters[key] = [];
                }
            }
        }

    } catch (err) {
        console.error('Failed to load scanner-config.json:', err.message);
    }
}

function save() {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    } catch (err) {
        console.error('Failed to write scanner-config.json:', err.message);
    }
}

function update(flag, del) {
    if (typeof flag === 'number' && !Number.isNaN(flag)) {
        config.flagThreshold = flag;
    }
    if (typeof del === 'number' && !Number.isNaN(del)) {
        config.deleteThreshold = del;
    }
    save();
}

function get() {
    return config;
}

load();

module.exports = { get, update, load, save };
