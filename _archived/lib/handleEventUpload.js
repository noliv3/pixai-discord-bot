// /lib/handleEventUpload.js

const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Downloads and saves an image to the event folder.
 *
 * @param {string} url - Image URL
 * @param {string} filename - Final filename
 * @param {string} folder - Target folder path
 * @returns {Promise<string|null>} File path or null if failed
 */
async function handleEventUpload(url, filename, folder) {
    try {
        const filepath = path.join(folder, filename);
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        fs.writeFileSync(filepath, response.data);
        return filepath;
    } catch (err) {
        console.error('Failed to download/save image:', err.message);
        return null;
    }
}

module.exports = { handleEventUpload };
