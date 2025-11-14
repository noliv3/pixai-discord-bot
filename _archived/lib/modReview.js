const { PermissionsBitField, REST, Routes } = require('discord.js');
const scannerConfig = require('./scannerConfig');
const { loadFlaggedReviews, saveFlaggedReviews } = require('./flaggedStore');
const { logModReview } = require('./modLogger');

const processing = new Set();
const RULES_LINK = '<#1041682785418629122>';

async function processFlaggedReview(reaction, user, client) {
  if (processing.has(reaction.message.id)) return false;
  processing.add(reaction.message.id);
  try {
    client ??= reaction.message.client;
    if (!client.rest)
      client.rest = new REST({ version: '10' }).setToken(scannerConfig.get().discordToken);

    const emoji   = reaction.emoji.name;
    const cfg     = scannerConfig.get();
    const modMsg  = reaction.message;

    client.flaggedReviews ??= loadFlaggedReviews() || new Map();
    const flagged = client.flaggedReviews.get(modMsg.id);
    if (!flagged || modMsg.channel.id !== cfg.moderatorChannelId) return false;

    /* Rechte-Check */
    const member = await modMsg.guild.members.fetch(user.id).catch(() => null);
    const isMod  = member && (
      (cfg.moderatorRoleId && member.roles.cache.has(cfg.moderatorRoleId)) ||
      member.permissions.has(PermissionsBitField.Flags.ManageMessages)
    );
    if (!isMod) return false;

    /* Helper: REST-Delete */
    const restDel = async () => {
      try {
        await client.rest.delete(Routes.channelMessage(flagged.channelId, flagged.messageId));
        return true;
      } catch { return false; }
    };

    /* ❌ --------------- Löschen --------------- */
    if (emoji === '❌' && !flagged.deleted) {
      const ok = await restDel();
      await modMsg.reply(
        ok ? `❌ Deleted post by <@${flagged.userId}>`
           : '❌ Could not delete – missing permission or message gone.'
      );
      if (ok) logModReview(`Deleted message ${flagged.messageId} via ${user.tag}`);
      flagged.deleted = true;
    }

    /* ⚠️ --------------- Warnen --------------- */
    if (emoji === '⚠️' && !flagged.warned) {
      const dmText =
`**Image moderation notice**

Hello <@${flagged.userId}>!
Your recent image appears to break our server guidelines.

Please review the rules here → ${RULES_LINK}

Thank you for understanding! 🙏

---

**画像モデレーションのお知らせ**

<@${flagged.userId}> さん、こんにちは！
あなたが投稿した画像は、サーバーのガイドラインに違反している可能性があります。

ルールはこちらをご確認ください → ${RULES_LINK}

ご協力ありがとうございます！ 🙏`;

      try {
        const dm = await client.rest.post(
          Routes.userChannels(), { body: { recipient_id: flagged.userId } }
        );
        await client.rest.post(
          Routes.channelMessages(dm.id), { body: { content: dmText } }
        );
        await modMsg.reply(`⚠️ Warned <@${flagged.userId}>`);
        logModReview(`Warned user ${flagged.userId} via ${user.tag}`);
      } catch {
        await modMsg.reply('⚠️ Could not DM the user (DMs disabled).');
      }
      flagged.warned = true;
    }

    /* Eintrag entfernen, wenn beides erledigt */
    if (flagged.deleted && flagged.warned) {
      client.flaggedReviews.delete(modMsg.id);
    } else {
      client.flaggedReviews.set(modMsg.id, flagged);   // Status speichern
    }
    saveFlaggedReviews(client.flaggedReviews);
    return true;
  } finally {
    processing.delete(reaction.message.id);
  }
}

module.exports = { processFlaggedReview };
