function extractTags(data) {
  if (!data || typeof data !== 'object') return [];

  if (Array.isArray(data.tags)) {
    return data.tags
      .map((entry) => (typeof entry === 'string' ? entry : entry?.label || entry?.name || entry?.tag))
      .filter(Boolean)
      .filter((tag) => tag.toLowerCase() !== 'rating:safe');
  }

  const modules = Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => key.startsWith('modules.'))
      .map(([key, value]) => [key.slice(8), value])
  );

  const rawTags =
    modules.deepdanbooru_tags?.tags ||
    modules.tagging?.tags ||
    modules.image_storage?.metadata?.danbooru_tags ||
    modules.image_storage?.metadata?.tags ||
    [];

  return (Array.isArray(rawTags) ? rawTags : [])
    .map((entry) => (typeof entry === 'string' ? entry : entry?.label || entry?.name || entry?.tag))
    .filter(Boolean)
    .filter((tag) => tag.toLowerCase() !== 'rating:safe');
}

function highlightTags(tags, matched = []) {
  if (!Array.isArray(tags)) return '—';
  const top = tags.slice(0, 20);
  if (top.length === 0) return '—';
  return top
    .map((tag) => (matched.includes(tag.toLowerCase()) ? `**${tag}**` : tag))
    .join(', ');
}

module.exports = {
  extractTags,
  highlightTags
};
