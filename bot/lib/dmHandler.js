const { PermissionsBitField } = require('discord.js');

const INVITE_REGEX = /https?:\/\/(?:discord\.gg|discord\.com\/invite)\/([A-Za-z0-9-]+)/i;
const DISCORD_INVITE_BASE = 'https://discord.com/oauth2/authorize';
const MAX_MESSAGE_LENGTH = 1900;

function formatValue(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return '[object]';
    }
  }
  return String(value);
}

function parseConfigValue(raw) {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'undefined') return undefined;
  if (!Number.isNaN(Number(raw)) && raw.trim() !== '') {
    return Number(raw);
  }
  if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      return raw;
    }
  }
  return raw;
}

function splitMessage(text) {
  if (!text || text.length <= MAX_MESSAGE_LENGTH) {
    return [text];
  }
  const chunks = [];
  let offset = 0;
  while (offset < text.length) {
    chunks.push(text.slice(offset, offset + MAX_MESSAGE_LENGTH));
    offset += MAX_MESSAGE_LENGTH;
  }
  return chunks;
}

function cloneConfig(config) {
  try {
    return JSON.parse(JSON.stringify(config));
  } catch (error) {
    return { ...config };
  }
}

async function ensureMember(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    return member;
  } catch (error) {
    return null;
  }
}

function hasAdminAccess(member, guild, guildConfig, permissionsModule) {
  if (!member) return false;
  if (guild?.ownerId && guild.ownerId === member.id) return true;
  if (member.permissions?.has?.(PermissionsBitField.Flags.Administrator)) {
    return true;
  }
  if (permissionsModule?.isGuildAdmin?.(member, guildConfig)) {
    return true;
  }
  return false;
}

function resolveConfigPath(target, path) {
  if (!path) return { exists: false };
  const segments = path.split('.');
  let current = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (current && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
    } else {
      return { exists: false };
    }
  }
  const lastKey = segments[segments.length - 1];
  if (!current || !Object.prototype.hasOwnProperty.call(current, lastKey)) {
    return { exists: false };
  }
  return {
    exists: true,
    parent: current,
    key: lastKey,
    value: current[lastKey]
  };
}

function buildOauthUrl({ clientId, scope, permissions, guildId }) {
  const url = new URL(DISCORD_INVITE_BASE);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', scope || 'bot applications.commands');
  if (permissions !== undefined && permissions !== null) {
    url.searchParams.set('permissions', String(permissions));
  }
  if (guildId) {
    url.searchParams.set('guild_id', guildId);
  }
  return url.toString();
}

function createDmHandler({ client, logger, configManager, permissions }) {
  async function handleInviteLink(message, globalConfig) {
    const match = message.content?.match?.(INVITE_REGEX);
    if (!match) {
      return false;
    }
    const inviteCode = match[1];
    logger.debug('DM-Invite erkannt', { userId: message.author.id, inviteCode });
    try {
      const invite = await client.fetchInvite(inviteCode);
      if (!invite?.guild) {
        await message.reply('Dieser Invite verweist nicht auf eine unterstützte Guild.');
        return true;
      }
      const targetGuild = invite.guild;
      const clientId = globalConfig?.bot?.clientId || process.env.DISCORD_CLIENT_ID || process.env.BOT_CLIENT_ID;
      if (!clientId) {
        logger.warn('Kein clientId für Bot-Invite konfiguriert.');
        await message.reply('Der Bot kann aktuell keinen Invite-Link erzeugen (clientId fehlt in der Konfiguration).');
        return true;
      }
      const permissionsValue = globalConfig?.bot?.invitePermissions;
      const inviteUrl = buildOauthUrl({
        clientId,
        scope: 'bot applications.commands',
        permissions: permissionsValue,
        guildId: targetGuild.id
      });
      logger.info('Invite-Link generiert', {
        userId: message.author.id,
        inviteCode,
        guildId: targetGuild.id
      });
      await message.reply(
        `Invite erkannt für **${targetGuild.name || targetGuild.id}**.\n` +
          `Bot-Invite: <${inviteUrl}>`
      );
    } catch (error) {
      logger.warn('Invite konnte nicht geladen werden', {
        userId: message.author.id,
        inviteCode,
        error: error.message
      });
      await message.reply('Der Invite-Link konnte nicht verarbeitet werden. Bitte prüfe den Link und versuche es erneut.');
    }
    return true;
  }

  async function listAccessibleGuilds(message) {
    const resultLines = [];
    for (const [guildId, guild] of client.guilds.cache) {
      const member = await ensureMember(guild, message.author.id);
      if (!member) continue;
      const guildConfig = configManager.getGuildConfig(guildId);
      if (!hasAdminAccess(member, guild, guildConfig, permissions)) continue;
      resultLines.push(`${guildId} – ${guild.name || 'Unbenannte Guild'}`);
    }
    if (resultLines.length === 0) {
      await message.reply('Keine Guild gefunden, auf der du Administrator bist und der Bot aktiv ist.');
      return;
    }
    const response = 'Guilds mit Admin-Zugriff:\n' + resultLines.join('\n');
    for (const chunk of splitMessage(response)) {
      await message.reply(chunk);
    }
  }

  async function showGuildConfig(message, guildId, globalConfig) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      await message.reply('Der Bot ist auf dieser Guild nicht aktiv.');
      return;
    }
    const member = await ensureMember(guild, message.author.id);
    if (!member) {
      await message.reply('Du bist kein Mitglied dieser Guild.');
      return;
    }
    const guildConfig = configManager.getGuildConfig(guildId);
    const isBotOwner = permissions?.isOwner?.(message.author.id, globalConfig);
    if (!hasAdminAccess(member, guild, guildConfig, permissions) && !isBotOwner) {
      await message.reply('Dir fehlen Administratorrechte auf dieser Guild.');
      return;
    }
    const configSummary = {
      prefix: guildConfig?.prefix || globalConfig?.bot?.prefix || '!',
      channels: guildConfig?.channels || {},
      roles: guildConfig?.roles || {},
      scan: guildConfig?.scan || {},
      modules: guildConfig?.modules || {},
      events: guildConfig?.events || {}
    };
    const header = 'Konfiguration für ' + (guild.name || guildId);
    await message.reply(header);
    const jsonString = JSON.stringify(configSummary, null, 2);
    const chunks = splitMessage(jsonString);
    for (const chunk of chunks) {
      await message.reply('```json\n' + chunk + '\n```');
    }
  }

  async function setGuildConfigValue(message, guildId, path, rawValue, globalConfig) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      await message.reply('Der Bot ist auf dieser Guild nicht aktiv.');
      return;
    }
    const member = await ensureMember(guild, message.author.id);
    if (!member) {
      await message.reply('Du bist kein Mitglied dieser Guild.');
      return;
    }
    const guildConfig = configManager.getGuildConfig(guildId);
    const isBotOwner = permissions?.isOwner?.(message.author.id, globalConfig);
    if (!hasAdminAccess(member, guild, guildConfig, permissions) && !isBotOwner) {
      await message.reply('Dir fehlen Administratorrechte auf dieser Guild.');
      return;
    }
    configManager.beginGuildOperation(guildId);
    try {
      const currentConfig = cloneConfig(configManager.getGuildConfig(guildId));
      const target = resolveConfigPath(currentConfig, path);
      if (!target.exists) {
        await message.reply('Der angegebene Konfigurationspfad existiert nicht.');
        return;
      }
      const newValue = parseConfigValue(rawValue);
      const oldValue = target.value;
      target.parent[target.key] = newValue;
      configManager.saveGuildConfig(guildId, currentConfig);
      logger.info('Guild-Konfiguration via DM aktualisiert', {
        guildId,
        userId: message.author.id,
        path,
        oldValue,
        newValue
      });
      await message.reply(
        `Konfiguration aktualisiert (${path}).\nAlt: ${formatValue(oldValue)}\nNeu: ${formatValue(newValue)}`
      );
    } catch (error) {
      logger.error('Fehler bei DM-Konfigurationsänderung', {
        guildId,
        userId: message.author.id,
        path,
        error: error.message
      });
      await message.reply('Die Konfiguration konnte nicht aktualisiert werden.');
    } finally {
      configManager.endGuildOperation(guildId);
    }
  }

  async function handleCommand(message, globalConfig) {
    const prefix = globalConfig?.bot?.prefix || '!';
    if (!message.content?.startsWith(prefix)) {
      return false;
    }
    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const commandName = args.shift()?.toLowerCase();
    if (!commandName) return false;
    logger.debug('DM-Command empfangen', { userId: message.author.id, command: commandName });
    if (commandName === 'guilds') {
      await listAccessibleGuilds(message);
      return true;
    }
    if (commandName === 'config') {
      if (args.length === 0) {
        await message.reply('Bitte gib eine Guild-ID an.');
        return true;
      }
      if (args[0] === 'set') {
        if (args.length < 4) {
          await message.reply('Verwendung: !config set <guildId> <pfad> <wert>');
          return true;
        }
        const guildId = args[1];
        const path = args[2];
        const value = args.slice(3).join(' ');
        await setGuildConfigValue(message, guildId, path, value, globalConfig);
        return true;
      }
      const guildId = args[0];
      await showGuildConfig(message, guildId, globalConfig);
      return true;
    }
    return false;
  }

  async function handleMessage(message, globalConfig) {
    logger.debug('DM-Nachricht verarbeitet', { userId: message.author.id });
    if (await handleCommand(message, globalConfig)) {
      return;
    }
    await handleInviteLink(message, globalConfig);
  }

  return { handleMessage };
}

module.exports = createDmHandler;
