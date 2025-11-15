function ensureVoteSet(record, emojiKey) {
  if (!record.votes) record.votes = {};
  if (!record.votes[emojiKey]) record.votes[emojiKey] = new Set();
  return record.votes[emojiKey];
}

function addVote(record, emojiKey, userId) {
  if (!record) return false;
  const set = ensureVoteSet(record, emojiKey);
  if (set.has(userId)) return false;
  set.add(userId);
  return true;
}

function removeVote(record, emojiKey, userId) {
  if (!record) return false;
  const set = ensureVoteSet(record, emojiKey);
  if (!set.has(userId)) return false;
  set.delete(userId);
  return true;
}

module.exports = {
  addVote,
  removeVote
};
