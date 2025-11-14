function calculateRisk(scores = {}) {
  const hentai = parseFloat(scores.hentai) || 0;
  const porn   = parseFloat(scores.porn) || 0;
  const sexy   = parseFloat(scores.sexy) || 0;
  return hentai + porn + sexy;
}

module.exports = { calculateRisk };
