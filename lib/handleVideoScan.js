// /lib/handleVideoScan.js


const { extractFramesFromBuffer } = require('./videoFrameExtractor');
const { scanBuffer } = require('./scan');
const { extractTags } = require('./tagUtils');
const { evaluateTags } = require('./scannerFilter');

/**
 * Builds a list of frame indices to scan based on total count and step size.
 * Always includes first and last.
 */
function buildFrameList(totalFrames, step) {
    const frames = new Set([0, totalFrames - 1]);
    for (let i = step; i < totalFrames - 1; i += step) {
        frames.add(i);
    }
    return Array.from(frames).sort((a, b) => a - b);
}

/**
 * Scans selected video frames for risky content.
 * 
 * @param {Buffer} buffer - The full video file buffer
 * @param {string} type - Either 'gif' or 'video'
 * @param {Object} config - Contains gifStep and videoStep
 * @returns {Promise<{frame: number, tags: string[], level: number, matched: string[]} | null>}
 */
async function handleVideoScan(buffer, type, config) {
	console.log('[DEBUG] handleVideoScan() reached');
	console.log('[DEBUG] Buffer size:', buffer.length);
	console.log('[DEBUG] Config:', config);
    const step = type === 'gif' ? config.gifStep || 5 : config.videoStep || 20;

    const frameCount = await extractFramesFromBuffer(buffer, null, true); // count only
    if (!frameCount || frameCount < 2) return null;

    const frameList = buildFrameList(frameCount, step);
    console.log(`[Scanner] ${frameCount} total frames / scanning ${frameList.length} selected frames.`);

    const frames = await extractFramesFromBuffer(buffer, frameList);

    for (const frameData of frames) {
        const scan = await scanBuffer(frameData.buffer);
        if (!scan) continue;

        const tags = extractTags(scan).map(t => t.toLowerCase());
        const { level, matched } = evaluateTags(tags);

        if (level <= 2) {
            return {
                frame: frameData.index,
                tags,
                level,
                matched
            };
        }
    }

    return null; // No critical frames found
}

module.exports = { handleVideoScan };
