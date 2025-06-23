// /lib/tagUtils.js

/**
 * Extract tag strings from the scanner result.
 * Handles both layouts:
 *   • /check  → tags liegen in modules.deepdanbooru_tags / modules.tagging …
 *   • /batch  → tags stehen als Array oben im JSON { tags: [...] }
 *
 * @param {object} data  JSON-Ergebnis vom Scanner
 * @returns {string[]}   Normalisierte Tag-Liste (ohne rating:safe)
 */
function extractTags(data) {
  /* ─── /batch: tags direkt im Root ─── */
  if (Array.isArray(data.tags)) {
    return data.tags
      .map(String)
      .filter(t => t && t.toLowerCase() !== 'rating:safe');
  }

  /* ─── /check: Tags in Module-Blöcken ─── */
  const modules = Object.fromEntries(
    Object.entries(data)
      .filter(([k]) => k.startsWith('modules.'))
      .map(([k, v]) => [k.slice(8), v])
  );

  const raw =
        modules.deepdanbooru_tags?.tags ||
        modules.tagging?.tags ||
        modules.image_storage?.metadata?.danbooru_tags ||
        modules.image_storage?.metadata?.tags ||
        [];

  return (Array.isArray(raw) ? raw : [])
    .map(t =>
      typeof t === 'string'
        ? t
        : (t.label || t.name || t.tag)
    )
    .filter(t => !!t && t.toLowerCase() !== 'rating:safe');
}

/**
 * Build a comma-separated preview list, highlighting matched tags.
 *
 * @param {string[]} tags   Alle Tags
 * @param {string[]} hits   Zu hervorhebende Tags
 * @returns {string}        Formatierter Vorschaustring
 */
function highlightTags(tags, hits = []) {
  return (
    tags
      .map(t => (hits.includes(t) ? `**${t}**` : t))
      .slice(0, 20)
      .join(', ') || '—'
  );
}

module.exports = { extractTags, highlightTags };
