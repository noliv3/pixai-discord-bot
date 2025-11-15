const DEFAULT_FILTERS = { '0': [], '1': [], '2': [], '3': [] };

function normalizeFilters(filters) {
  const base = { ...DEFAULT_FILTERS };
  if (!filters || typeof filters !== 'object') {
    return base;
  }
  for (const [key, values] of Object.entries(filters)) {
    if (!base[key]) continue;
    if (!Array.isArray(values)) {
      base[key] = [];
    } else {
      base[key] = values
        .map((entry) => (typeof entry === 'string' ? entry.toLowerCase() : null))
        .filter(Boolean);
    }
  }
  return base;
}

function mergeFilters(globalFilters, guildFilters) {
  const normalizedGlobal = normalizeFilters(globalFilters);
  const normalizedGuild = normalizeFilters(guildFilters);
  const merged = { ...DEFAULT_FILTERS };
  for (const key of Object.keys(DEFAULT_FILTERS)) {
    merged[key] = Array.from(new Set([...(normalizedGlobal[key] || []), ...(normalizedGuild[key] || [])]));
  }
  return merged;
}

function resolveFilters(globalConfig, guildConfig) {
  const globalFilters = globalConfig?.defaults?.guild?.scan?.tagFilters || globalConfig?.scan?.tagFilters;
  const guildFilters = guildConfig?.scan?.tagFilters;
  return mergeFilters(globalFilters, guildFilters);
}

function evaluateTags(tags, filters) {
  const normalizedTags = (tags || []).map((tag) => (typeof tag === 'string' ? tag.toLowerCase() : null)).filter(Boolean);
  const hits = { 0: [], 1: [], 2: [] };
  for (const level of ['0', '1', '2']) {
    const candidates = filters[level] || [];
    for (const tag of candidates) {
      if (normalizedTags.includes(tag)) {
        hits[level].push(tag);
      }
    }
  }
  if (hits[0].length > 0) {
    return { level: 0, matched: hits[0] };
  }
  if (hits[1].length > 0) {
    return { level: 1, matched: hits[1] };
  }
  if (hits[2].length > 0) {
    return { level: 2, matched: hits[2] };
  }
  return { level: 3, matched: [] };
}

function calculateRisk(scores = {}) {
  const hentai = Number.parseFloat(scores.hentai) || 0;
  const porn = Number.parseFloat(scores.porn) || 0;
  const sexy = Number.parseFloat(scores.sexy) || 0;
  return hentai + porn + sexy;
}

function resolveThresholds(guildConfig, globalConfig) {
  const guildThresholds = guildConfig?.scan?.thresholds || {};
  const globalThresholds = globalConfig?.defaults?.guild?.scan?.thresholds || {};
  const flag = Number.isFinite(guildThresholds.flag)
    ? guildThresholds.flag
    : Number.isFinite(globalThresholds.flag)
      ? globalThresholds.flag
      : 0.6;
  const deletion = Number.isFinite(guildThresholds.delete)
    ? guildThresholds.delete
    : Number.isFinite(globalThresholds.delete)
      ? globalThresholds.delete
      : 0.95;
  return { flag, delete: deletion };
}

function determineAction({ level, risk, thresholds }) {
  if (level === 0) {
    return { action: 'delete', reason: 'tag-level-0' };
  }
  if (level === 1 || level === 2) {
    return { action: 'flag', reason: `tag-level-${level}` };
  }
  if (risk >= thresholds.delete) {
    return { action: 'delete', reason: 'risk-delete' };
  }
  if (risk >= thresholds.flag) {
    return { action: 'flag', reason: 'risk-flag' };
  }
  return { action: 'ignore', reason: 'none' };
}

function summarize(results) {
  const summary = {
    action: 'ignore',
    reason: 'none',
    highestRisk: 0,
    highestLevel: 3,
    matchedTags: new Set(),
    reasons: new Set(),
    actedItems: []
  };
  for (const result of results) {
    if (result.risk > summary.highestRisk) {
      summary.highestRisk = result.risk;
    }
    if (result.level < summary.highestLevel) {
      summary.highestLevel = result.level;
    }
    for (const tag of result.matched) {
      summary.matchedTags.add(tag);
    }
    if (result.decision?.reason && result.decision.action !== 'ignore') {
      summary.reasons.add(result.decision.reason);
      summary.actedItems.push(result);
    }
    const severity = result.decision?.action === 'delete' ? 2 : result.decision?.action === 'flag' ? 1 : 0;
    const currentSeverity = summary.action === 'delete' ? 2 : summary.action === 'flag' ? 1 : 0;
    if (severity > currentSeverity) {
      summary.action = result.decision.action;
      summary.reason = result.decision.reason;
    }
  }
  summary.matchedTags = Array.from(summary.matchedTags);
  summary.reasons = Array.from(summary.reasons);
  return summary;
}

module.exports = {
  resolveFilters,
  evaluateTags,
  calculateRisk,
  resolveThresholds,
  determineAction,
  summarize
};
