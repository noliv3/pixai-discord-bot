// /lib/scannerFilter.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'scanner-filters.json');

// Standardstruktur
const defaultFilters = {
    "0": [], // Sofort löschen
    "1": [], // Explicit
    "2": [], // Questionable
    "3": []  // Safe/Allow (wird aktuell nicht aktiv genutzt)
};

let filters = { ...defaultFilters };

// Laden von Datei
function loadFilters() {
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(raw);
            filters = { ...defaultFilters, ...parsed };
        } else {
            saveFilters(); // Erstellt Datei, falls nicht vorhanden
        }
    } catch (err) {
        console.error('Failed to load scanner-filters.json:', err.message);
    }
}

// Speichern
function saveFilters() {
    try {
        fs.writeFileSync(filePath, JSON.stringify(filters, null, 4));
    } catch (err) {
        console.error('Failed to write scanner-filters.json:', err.message);
    }
}

// Zugriff auf aktuelle Filterliste
function getFilters() {
    return filters;
}

// Eintrag hinzufügen
function addFilter(category, tag) {
    const cat = String(category);
    if (!filters[cat]) filters[cat] = [];
    if (!filters[cat].includes(tag)) {
        filters[cat].push(tag);
        saveFilters();
    }
}

// Eintrag entfernen
function removeFilter(category, tag) {
    const cat = String(category);
    if (!filters[cat]) return;
    filters[cat] = filters[cat].filter(t => t !== tag);
    saveFilters();
}

// Bewertung anhand eines Tag-Arrays
function evaluateTags(tags) {
    const found = { 0: [], 1: [], 2: [] };
    for (const cat of ['0', '1', '2']) {
        for (const word of filters[cat]) {
            if (tags.some(t => typeof t === 'string' ? t === word : t.label === word)) {
                found[cat].push(word);
            }
        }
    }
    if (found[0].length) return { level: 0, matched: found[0] };
    if (found[1].length) return { level: 1, matched: found[1] };
    if (found[2].length) return { level: 2, matched: found[2] };
    return { level: 3, matched: [] }; // Safe
}

loadFilters();

module.exports = {
    getFilters,
    addFilter,
    removeFilter,
    evaluateTags
};
