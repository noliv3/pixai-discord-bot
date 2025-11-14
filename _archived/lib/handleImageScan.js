// /lib/handleImageScan.js

const { scanImage } = require('./scan');
const { extractTags } = require('./tagUtils');
const { evaluateTags } = require('./scannerFilter');

/**
 * Scan an image URL and evaluate its tags.
 *
 * @param {string} url - The image URL to scan.
 * @returns {Promise<{tags: string[], level: number, matched: string[]}|null>} Evaluation result or null if failed.
 */
async function handleImageScan(url) {
    const scan = await scanImage(url);
    if (!scan) return null;

    const tags = extractTags(scan).map(t => t.toLowerCase());
    const result = evaluateTags(tags);

    return {
        tags,
        level: result.level,
        matched: result.matched
    };
}

module.exports = { handleImageScan };
