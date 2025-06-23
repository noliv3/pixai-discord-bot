const axios = require('axios');
const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');
const invalidLog = path.join(logDir, 'invalid_urls.log');

function logInvalidUrl(url) {
    try {
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const ts = new Date().toISOString();
        fs.appendFileSync(invalidLog, `${ts} ${url}\n`);
    } catch (err) {
        console.warn('Failed to write invalid URL log:', err.message);
    }
}

/**
 * Prüft, ob eine gegebene URL ein Bild ist (per Content-Type Header).
 * 
 * @param {string} url - Die zu prüfende URL
 * @returns {Promise<boolean>} true wenn Content-Type ein Bildtyp ist
 */
async function isImageUrl(url) {
    try {
        const response = await axios.head(url, {
            timeout: 3000,
            maxRedirects: 2,
            validateStatus: status => status < 400
        });

        const type = response.headers['content-type'];
        if (typeof type === 'string' && type.startsWith('image/')) {
            return true;
        }

        console.warn('HEAD did not indicate image, falling back to GET:', url);
    } catch (err) {
        console.warn('HEAD request failed, falling back to GET:', url, err.message);
    }

    try {
        const resp = await axios({
            method: 'GET',
            url,
            timeout: 3000,
            maxRedirects: 2,
            responseType: 'stream',
            validateStatus: status => status < 400
        });

        const type = resp.headers['content-type'];
        if (resp.data && typeof resp.data.destroy === 'function') {
            resp.data.destroy();
        }
        const isImg = typeof type === 'string' && type.startsWith('image/');
        if (!isImg) logInvalidUrl(url);
        return isImg;
    } catch (err) {
        console.warn('URL check failed:', url, err.message);
        logInvalidUrl(url);
        return false;
    }
}

module.exports = { isImageUrl };
