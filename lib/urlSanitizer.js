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
 * Versucht zu erkennen, ob eine URL ein echtes Bild ist.
 * Prüft zuerst mit HEAD, dann GET, ggf. HTML og:image-Fallback.
 */
async function isImageUrl(url) {
    try {
        const response = await axios.head(url, {
            timeout: 3000,
            maxRedirects: 5,
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
            maxRedirects: 5,
            responseType: 'text',
            validateStatus: status => status < 400
        });

        const type = resp.headers['content-type'];
        if (type && type.startsWith('image/')) {
            return true;
        }

        const html = resp.data?.toString?.('utf8') || '';
        const match = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
        if (match) {
            const imgUrl = match[1];
            console.log('Found og:image →', imgUrl);
            return await isImageUrl(imgUrl); // rekursiv prüfen
        }

        logInvalidUrl(url);
        return false;
    } catch (err) {
        console.warn('URL check failed:', url, err.message);
        logInvalidUrl(url);
        return false;
    }
}

/**
 * Extrahiert die og:image URL aus einem HTML-Dokument.
 * (wird separat exportiert für Fallback-Verarbeitung in handleMessageCreate.js)
 */
function extractOgImageUrl(html) {
    const match = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
    return match ? match[1] : null;
}

module.exports = { isImageUrl, extractOgImageUrl };
