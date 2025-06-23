// /lib/handleMessageCreate.js

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');

const scannerConfig          = require('./scannerConfig');
const { scanImage }          = require('./scan');
const { isImageUrl }         = require('./urlSanitizer');
const { getFilters }         = require('./filterManager');
const { isRecentlyScanned, markScanned } = require('./scanCache');
const { logModReview }       = require('./modLogger');
const { saveFlaggedReviews } = require('./flaggedStore');

// Prefix für Chat-Befehle
const PREFIX = '!';

/* ───────── Hilfsfunktionen ───────── */
function isImage(attachment) {
    const url = (attachment.url || '').toLowerCase();
    return url.endsWith('.png') ||
           url.endsWith('.jpg') ||
           url.endsWith('.jpeg') ||
           url.endsWith('.gif') ||
           url.endsWith('.webp') ||
           url.endsWith('.mp4') ||
           url.endsWith('.webm');
}

function extractTags(data) {
    const modules = Object.fromEntries(
        Object.entries(data)
              .filter(([k]) => k.startsWith('modules.'))
              .map(([k, v]) => [k.slice(8), v])
    );
    const rawTags =
        modules.deepdanbooru_tags?.tags ||
        modules.tagging?.tags ||
        modules.image_storage?.metadata?.danbooru_tags ||
        modules.image_storage?.metadata?.tags ||
        [];
    const tags = Array.isArray(rawTags) ? rawTags : [];
    return tags
        .map(t => typeof t === 'string' ? t : (t.label || t.name || t.tag))
        .filter(Boolean);
}

function highlight(tags, hits) {
    return tags
        .map(t => hits.includes(t) ? `**${t}**` : t)
        .slice(0, 20)
        .join(', ') || '—';
}

/* ───────── Haupt-Scan-Funktion ───────── */
async function handleScan(item, message, client) {
    if (!client.flaggedReviews) client.flaggedReviews = new Map();

    const data = await scanImage(item.url).catch(() => null);
    if (!data) return false;

    const tags    = extractTags(data).map(t => t.toLowerCase());
    const filters = getFilters();
    const cfg     = scannerConfig.get();
    const matches = lvl => filters[lvl]?.filter(f => tags.includes(f)) || [];
    const m0 = matches(0), m1 = matches(1), m2 = matches(2);
    const risk = parseFloat(data.risk ?? data.risk_score ?? 0) || 0;
    const tagList = highlight(tags, [...m0, ...m1, ...m2]);

    // sofort löschen
    if (m0.length || risk >= cfg.deleteThreshold) {
        await message.delete().catch(() => {});
        if (cfg.moderatorChannelId) {
            const ch = await client.channels.fetch(cfg.moderatorChannelId).catch(() => null);
            if (ch?.isTextBased()) {
                await ch.send({
                    content: `🚫 **Deleted** <@${message.author.id}>'s upload (risk ${risk})\n**Tags:** ${tagList}\n[Jump](${message.url})`,
                    files: [item.url]
                });
            }
        }
        return true;
    }

    // flaggen
    if (m1.length || m2.length || risk >= cfg.flagThreshold) {
        if (cfg.moderatorChannelId) {
            const ch = await client.channels.fetch(cfg.moderatorChannelId).catch(() => null);
            if (!ch?.isTextBased()) return false;

            const summary = await ch.send({
                content: `⚠️ **Flagged** <@${message.author.id}>'s upload (risk ${risk})\n**Tags:** ${tagList}\n[Jump](${message.url})`,
                files: [item.url]
            });

            client.flaggedReviews.set(summary.id, {
                channelId: message.channel.id,
                messageId: message.id,
                userId:    message.author.id
            });
            console.log('[flaggedReviews] add', { key: summary.id, size: client.flaggedReviews.size });
            saveFlaggedReviews(client.flaggedReviews);
            logModReview(`Flagged message ${message.id} by ${message.author.tag}`);

            await Promise.all(['👍', '👎', '❌', '⚠️'].map(e => summary.react(e)));
        }
    }

    return false;
}

/* ───────── Discord-Event ───────── */
module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (!message.guild || message.author.bot) return;

        // ==== Chat-Befehle mit "!" =====
        if (message.content.startsWith(PREFIX)) {
            const [cmd, ...args] = message.content.slice(PREFIX.length).trim().split(/\s+/);
            const command = client.commands.get(cmd);
            console.log(`[cmd] ${message.author.tag} → ${cmd} ${args.join(' ')}`);
            if (command) {
                try {
                    await command.execute(message, client, args);
                } catch (err) {
                    console.error(`[cmd] Error in ${cmd}:`, err);
                }
            }
            return;
        }

        // ==== Auto-Scan: 10-Minuten-Cache für ❓ ====
        if (!client.scannedMessages) client.scannedMessages = new Set();
        if (client.scannedMessages.has(message.id)) return;
        client.scannedMessages.add(message.id);
        markScanned(message.id);

        const attachments = [...message.attachments.values()];
        const urls        = [...message.content.matchAll(/https?:\/\/\S+/gi)].map(m => ({ url: m[0] }));
        const items       = [...attachments, ...urls];

        for (const item of items) {
            const ok = item.filename
                     ? isImage(item)
                     : await isImageUrl(item.url);
            if (!ok) continue;
            await handleScan(item, message, client);
        }
    }
};
