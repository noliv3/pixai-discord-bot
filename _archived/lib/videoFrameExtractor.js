// /lib/videoFrameExtractor.js

const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { exec, execSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const MAX_FFMPEG_PROCS = 2;
let ffmpegActive = 0;
const ffmpegQueue = [];

// Define internal ffmpeg/ffprobe paths
const ffmpegPath = path.join(__dirname, '..', 'ffmpeg', 'bin', 'ffmpeg.exe');
const ffprobePath = path.join(__dirname, '..', 'ffmpeg', 'bin', 'ffprobe.exe');

function acquireFfmpeg() {
    return new Promise((resolve) => {
        if (ffmpegActive < MAX_FFMPEG_PROCS) {
            ffmpegActive++;
            resolve();
        } else {
            ffmpegQueue.push(resolve);
        }
    });
}

function releaseFfmpeg() {
    ffmpegActive--;
    if (ffmpegQueue.length > 0) {
        ffmpegActive++;
        ffmpegQueue.shift()();
    }
}

async function runFfmpeg(cmd) {
    await acquireFfmpeg();
    try {
        console.log('[FFMPEG] Executing:', cmd);
        await new Promise((resolve, reject) => {
            exec(cmd, (err, stdout, stderr) => {
                if (err) {
                    console.error('[FFMPEG ERROR]', stderr || err);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    } finally {
        releaseFfmpeg();
    }
}

/**
 * Extracts specific frames from a video file.
 * @param {string} filePath Path to the video file
 * @param {number[]|null} frameNumbers List of frame indices or null
 * @param {boolean} countOnly If true, returns number of total frames
 * @returns {Promise<number|Array<{ index: number, buffer: Buffer }>>}
 */
async function extractFrames(filePath, frameNumbers, countOnly = false) {
    if (countOnly) {
        const cmd = `"${ffprobePath}" -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "${filePath}"`;
        try {
            const output = execSync(cmd).toString().trim();
            const count = parseInt(output, 10);
            console.log(`[FFPROBE] Frame count for ${path.basename(filePath)}: ${count}`);
            return count;
        } catch (err) {
            console.error('[FFPROBE ERROR]', err.message);
            return null;
        }
    }

    const results = [];
    for (const frame of frameNumbers) {
        const tmpFrame = path.join(os.tmpdir(), `frame_${Date.now()}_${frame}.jpg`);
        const cmd = `"${ffmpegPath}" -y -i "${filePath}" -vf "select=eq(n\,${frame})" -vframes 1 "${tmpFrame}"`;
        try {
            await runFfmpeg(cmd);
            const buffer = await fs.readFile(tmpFrame);
            results.push({ index: frame, buffer });
            console.log(`[FRAME] Extracted frame ${frame} (${buffer.length} bytes)`);
        } catch (err) {
            console.error(`[FRAME ERROR] Failed to extract frame ${frame}:`, err.message);
        } finally {
            await fs.unlink(tmpFrame).catch(() => {});
        }
    }
    return results;
}

/**
 * Accepts a Buffer instead of file path. Saves temp file and uses extractFrames.
 * @param {Buffer} buffer - Raw video/gif buffer
 * @param {Array<number>|null} frameList - Frame indices
 * @param {boolean} countOnly - Count frames only
 * @returns {Promise<number|Array<{ index: number, buffer: Buffer }>>}
 */
async function extractFramesFromBuffer(buffer, frameList, countOnly = false) {
    const tmpFile = path.join(os.tmpdir(), `vid_${Date.now()}_${uuidv4()}.mp4`);
    await fs.writeFile(tmpFile, buffer);
    console.log(`[TEMP] Written buffer to ${tmpFile} (${buffer.length} bytes)`);
    try {
        const result = await extractFrames(tmpFile, frameList, countOnly);
        return result;
    } finally {
        await fs.unlink(tmpFile).catch(() => {});
        console.log(`[CLEANUP] Deleted temp file ${tmpFile}`);
    }
}

module.exports = {
    extractFrames,
    extractFramesFromBuffer
};
