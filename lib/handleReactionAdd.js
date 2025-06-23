// /lib/handleReactionAdd.js   (ganze Datei)

const { handlePublicScan }      = require('./publicScanHandler');
const { processFlaggedReview }  = require('./modReview');
const { addVote, updateVoteCount } = require('./voteUtils');
const scannerConfig             = require('./scannerConfig');

/**
 * Handles a reaction added to a message (voting, moderation, or public scan).
 *
 * @param {MessageReaction} reaction
 * @param {User}           user
 * @param {Client}         client   ← kann bei älteren Wrappern undefined sein
 */
async function handleReactionAdd(reaction, user, client) {
  try {
    /* ▸ Fallback: falls Wrapper keinen client übergibt */
    if (!client) client = reaction.message.client;

    /* Partials nachladen – sonst fehlen IDs/Channel */
    if (reaction.partial)           await reaction.fetch().catch(() => null);
    if (reaction.message.partial)   await reaction.message.fetch().catch(() => null);

    if (user.bot) return;

    const message   = reaction.message;
    const emojiName = reaction.emoji.name;
    const { moderatorChannelId: modChannelId } = scannerConfig.get();

    /* === Moderator-Channel === */
    if (message.channel.id === modChannelId) {
      await processFlaggedReview(reaction, user, client);
      return;
    }

    /* === Public Tag Scan Trigger === */
    if (['?', '❓'].includes(emojiName)) {
      if (message.attachments?.size > 0) {
        const attachment = message.attachments.first();
        await handlePublicScan(message, attachment, client);
      }
    }

    /* === Event Voting === */
    const event = client.activeEvents?.get(message.channel.id);
    if (event) {
      const entry = event.entries.find(e => e.messageId === message.id);
      if (entry) {
        addVote(entry, user.id, event);
        await updateVoteCount(entry, event.folder);
      }
    }
  } catch (err) {
    console.error('[handleReactionAdd] Error:', err);
  }
}

module.exports = { handleReactionAdd };
