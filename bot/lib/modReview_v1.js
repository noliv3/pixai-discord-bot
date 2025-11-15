const { EmbedBuilder } = require('discord.js');

const permissions = require('./permissions_v1');
const { highlightTags } = require('./tagUtils_v1');

const REVIEW_EMOJIS = ['✅', '❌', '⚠️', '🔁'];

function resolveModChannelId(guildConfig) {
  return guildConfig?.channels?.modLog || guildConfig?.channels?.moderation || null;
}

function resolveRulesLink(guildConfig) {
  if (guildConfig?.scan?.rulesLink) return guildConfig.scan.rulesLink;
  const rulesChannelId = guildConfig?.channels?.rules;
  if (rulesChannelId) return `<#${rulesChannelId}>`;
  return 'the server rules';
}

function statusLabel(status) {
  switch (status) {
    case 'deleted':
      return 'Deleted';
    case 'approved':
      return 'Approved';
    case 'warned':
      return 'Warned';
    case 'pending':
    default:
      return 'Pending review';
  }
}

function buildRecord(message, scanResult) {
  const attachments = scanResult.results.map((entry) => ({
    url: entry.download.finalUrl,
    type: entry.target.type,
    origin: entry.target.origin,
    name: entry.target.name
  }));
  const tags = scanResult.results.flatMap((entry) => entry.tags);
  return {
    messageId: message.id,
    guildId: message.guildId,
    channelId: message.channelId,
    userId: message.author.id,
    messageUrl: message.url,
    action: scanResult.summary.action,
    status: scanResult.summary.action === 'delete' ? 'deleted' : 'pending',
    risk: scanResult.summary.highestRisk,
    level: scanResult.summary.highestLevel,
    matchedTags: scanResult.summary.matchedTags,
    reasons: scanResult.summary.reasons,
    attachments,
    tags,
    history: []
  };
}

function buildEmbed(record, scanResult, moderatorNote) {
  const baseData = scanResult.embed || {};
  const embed = EmbedBuilder.from(baseData);
  if (!embed.data.description || !embed.data.description.includes('[Zum Original]')) {
    embed.setDescription([
      `**User:** <@${record.userId}>`,
      `**Kanal:** <#${record.channelId}>`,
      `**Risk:** ${record.risk.toFixed(3)} | Level ${record.level}`,
      `**Tags:** ${highlightTags(record.tags || [], record.matchedTags || [])}`,
      `[Zum Original](${record.messageUrl})`
    ].join('\n'));
  }
  const firstAttachment = record.attachments?.find((item) => item.url);
  if (firstAttachment) {
    embed.setImage(firstAttachment.url);
  }
  embed.spliceFields(0, embed.data.fields?.length || 0);
  embed.addFields(
    { name: 'Status', value: moderatorNote || statusLabel(record.status), inline: true },
    { name: 'Risk', value: `${record.risk.toFixed(3)} (Level ${record.level})`, inline: true }
  );
  if ((record.matchedTags || []).length > 0) {
    embed.addFields({
      name: 'Triggered Tags',
      value: record.matchedTags.map((tag) => `\`${tag}\``).join(', ')
    });
  }
  if (record.reasons?.length) {
    embed.setFooter({ text: record.reasons.join(', ') });
  }
  return embed;
}

async function postModLog({ client, message, record, scanResult, guildConfig, flaggedStore, logger }) {
  const modChannelId = resolveModChannelId(guildConfig);
  if (!modChannelId) {
    logger?.warn?.('Kein Moderationskanal konfiguriert – Flag wird nicht veröffentlicht', {
      guildId: message.guildId
    });
    flaggedStore.upsert(record);
    return null;
  }

  let channel;
  try {
    channel = await client.channels.fetch(modChannelId);
  } catch (error) {
    logger?.error?.('Mod-Kanal konnte nicht geladen werden', { error: error.message, channelId: modChannelId });
    flaggedStore.upsert(record);
    return null;
  }
  if (!channel?.isTextBased()) {
    logger?.warn?.('Mod-Kanal ist nicht textbasiert', { channelId: modChannelId });
    flaggedStore.upsert(record);
    return null;
  }

  const embed = buildEmbed(record, scanResult);
  const payload = {
    content:
      record.action === 'delete'
        ? `🚫 **Deleted** <@${record.userId}> — automatische Prüfung`
        : `⚠️ **Flagged** <@${record.userId}> — automatische Prüfung`,
    embeds: [embed]
  };

  const sent = await channel.send(payload);
  if (record.action === 'flag') {
    for (const emoji of REVIEW_EMOJIS) {
      try {
        await sent.react(emoji);
      } catch (error) {
        logger?.debug?.('Konnte Review-Emoji nicht setzen', { emoji, error: error.message });
      }
    }
  }

  const stored = flaggedStore.upsert({
    ...record,
    reviewMessageId: sent.id,
    reviewChannelId: sent.channelId
  });
  return stored;
}

async function handleDelete(message, record, logger) {
  try {
    await message.delete();
    logger?.info?.('Nachricht aufgrund Auto-Moderation gelöscht', {
      messageId: message.id,
      guildId: message.guildId
    });
    return true;
  } catch (error) {
    logger?.warn?.('Konnte Nachricht nicht löschen', {
      messageId: message.id,
      error: error.message
    });
    return false;
  }
}

async function handleScanOutcome({ message, scanResult, client, guildConfig, flaggedStore, logger }) {
  if (!scanResult) return null;
  if (scanResult.summary.action === 'ignore') return null;

  const record = buildRecord(message, scanResult);
  if (scanResult.summary.action === 'delete') {
    await handleDelete(message, record, logger);
  }

  const stored = await postModLog({
    client,
    message,
    record,
    scanResult,
    guildConfig,
    flaggedStore,
    logger
  });

  if (!stored) {
    flaggedStore.upsert(record);
    return record;
  }
  return stored;
}

async function updateReviewMessage(client, record, moderatorNote, logger) {
  if (!record.reviewMessageId || !record.reviewChannelId) return;
  try {
    const channel = await client.channels.fetch(record.reviewChannelId);
    if (!channel?.isTextBased()) return;
    const modMessage = await channel.messages.fetch(record.reviewMessageId);
    const embed = buildEmbed(record, { embed: modMessage.embeds[0]?.toJSON?.() || {} }, moderatorNote);
    await modMessage.edit({ embeds: [embed] });
  } catch (error) {
    logger?.debug?.('Konnte Review-Message nicht aktualisieren', { error: error.message });
  }
}

async function warnUser(client, record, guildConfig, moderator, logger) {
  const rulesLink = resolveRulesLink(guildConfig);
  const warnLines = [
    '**Image moderation notice**',
    '',
    `Hello <@${record.userId}>!`,
    'Your recent image appears to break our server guidelines.',
    '',
    `Please review the rules here → ${rulesLink}`,
    '',
    'Thank you for understanding! 🙏',
    '',
    '---',
    '',
    '**画像モデレーションのお知らせ**',
    '',
    `<@${record.userId}> さん、こんにちは！`,
    'あなたが投稿した画像は、サーバーのガイドラインに違反している可能性があります。',
    '',
    `ルールはこちらをご確認ください → ${rulesLink}`,
    '',
    'ご協力ありがとうございます！ 🙏'
  ];
  try {
    const user = await client.users.fetch(record.userId);
    await user.send(warnLines.join('\n'));
    logger?.info?.('Warnung per DM gesendet', { userId: record.userId, moderator: moderator.id });
    return true;
  } catch (error) {
    logger?.warn?.('Warnung per DM fehlgeschlagen', { userId: record.userId, error: error.message });
    return false;
  }
}

async function handleReviewReaction({ reaction, user, client, guildConfig, flaggedStore, logger }) {
  const record = flaggedStore.findByReviewMessage(reaction.message.id);
  if (!record) return false;

  const guild = reaction.message.guild;
  if (!guild) return false;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!permissions.hasModRole(member, guildConfig)) return false;

  const emoji = reaction.emoji.name;
  const history = record.history || [];
  let updated;

  if (emoji === '✅') {
    updated = flaggedStore.upsert({
      messageId: record.messageId,
      status: 'approved',
      history: [...history, { action: 'approved', moderatorId: user.id, timestamp: new Date().toISOString() }]
    });
    await updateReviewMessage(client, updated, `Approved by <@${user.id}>`, logger);
    return true;
  }

  if (emoji === '❌') {
    try {
      const channel = await client.channels.fetch(record.channelId);
      if (channel?.isTextBased()) {
        const original = await channel.messages.fetch(record.messageId);
        await original.delete();
      }
    } catch (error) {
      logger?.warn?.('Moderator konnte Original-Nachricht nicht löschen', { error: error.message });
    }
    updated = flaggedStore.upsert({
      messageId: record.messageId,
      status: 'deleted',
      history: [...history, { action: 'deleted', moderatorId: user.id, timestamp: new Date().toISOString() }]
    });
    await updateReviewMessage(client, updated, `Deleted by <@${user.id}>`, logger);
    return true;
  }

  if (emoji === '⚠️') {
    const warned = await warnUser(client, record, guildConfig, user, logger);
    updated = flaggedStore.upsert({
      messageId: record.messageId,
      status: warned ? 'warned' : record.status,
      history: [...history, { action: warned ? 'warned' : 'warn_failed', moderatorId: user.id, timestamp: new Date().toISOString() }]
    });
    await updateReviewMessage(client, updated, warned ? `Warned by <@${user.id}>` : `Warn failed by <@${user.id}>`, logger);
    return true;
  }

  if (emoji === '🔁') {
    updated = flaggedStore.upsert({
      messageId: record.messageId,
      status: 'pending',
      history: [...history, { action: 'reset', moderatorId: user.id, timestamp: new Date().toISOString() }]
    });
    await updateReviewMessage(client, updated, `Reset by <@${user.id}>`, logger);
    return true;
  }

  return false;
}

async function handleReviewReactionRemove({ reaction, user, client, guildConfig, flaggedStore, logger }) {
  const record = flaggedStore.findByReviewMessage(reaction.message.id);
  if (!record) return false;
  if (record.status === 'deleted') return false;
  const guild = reaction.message.guild;
  if (!guild) return false;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!permissions.hasModRole(member, guildConfig)) return false;
  const emoji = reaction.emoji.name;
  if (!['✅', '⚠️'].includes(emoji)) return false;
  const history = record.history || [];
  const updated = flaggedStore.upsert({
    messageId: record.messageId,
    status: 'pending',
    history: [...history, { action: `removed_${emoji}`, moderatorId: user.id, timestamp: new Date().toISOString() }]
  });
  await updateReviewMessage(client, updated, `Pending review (reset by <@${user.id}>)`, logger);
  return true;
}

module.exports = {
  handleScanOutcome,
  handleReviewReaction,
  handleReviewReactionRemove
};
