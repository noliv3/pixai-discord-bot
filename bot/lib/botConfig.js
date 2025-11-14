const fs = require('fs');
const path = require('path');

const CONFIG_FILENAME = 'bot-config.json';
const DEFAULT_PATHS = {
  eventFiles: './data/events',
  deletedFiles: './data/deleted',
  logs: './data/logs'
};
const DEFAULT_VERSIONS = {
  events: 'v1',
  commands: 'v1',
  scannerClient: 'v1',
  eventStore: 'v1'
};

function resolveConfigPath() {
  return path.join(__dirname, '..', 'config', CONFIG_FILENAME);
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function normalizeConfigShape(config) {
  const normalized = { ...(config || {}) };

  const bot = { ...(normalized.bot || {}) };
  if (!bot.token && bot.discordToken) {
    bot.token = bot.discordToken;
  }
  if (bot.token && !bot.discordToken) {
    bot.discordToken = bot.token;
  }
  bot.prefix = bot.prefix || '!';

  const ownerList = [...new Set([...toArray(bot.owners), ...toArray(bot.ownerIds)])];
  bot.owners = ownerList;
  bot.ownerIds = ownerList;

  bot.defaultGuild = { ...(bot.defaultGuild || {}) };
  normalized.bot = bot;

  const scanner = { ...(normalized.scanner || {}) };
  if (!scanner.baseUrl && scanner.url) {
    scanner.baseUrl = scanner.url;
  }
  if (scanner.baseUrl && !scanner.url) {
    scanner.url = scanner.baseUrl;
  }
  if (!scanner.clientId && scanner.email) {
    scanner.clientId = scanner.email;
  }
  if (scanner.clientId && !scanner.email) {
    scanner.email = scanner.clientId;
  }
  normalized.scanner = scanner;

  normalized.guilds = normalized.guilds || {};
  normalized.paths = { ...DEFAULT_PATHS, ...(normalized.paths || {}) };
  normalized.versions = { ...DEFAULT_VERSIONS, ...(normalized.versions || {}) };

  return normalized;
}

function loadConfig() {
  const configPath = resolveConfigPath();
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const normalized = normalizeConfigShape(parsed);
  if (!normalized.bot || !normalized.bot.token) {
    throw new Error('bot-config.json: Feld "bot.token" bzw. "bot.discordToken" fehlt.');
  }
  return normalized;
}

function saveConfig(config) {
  const configPath = resolveConfigPath();
  const normalized = normalizeConfigShape(config);
  if (!normalized.bot || !normalized.bot.token) {
    throw new Error('bot-config.json: Feld "bot.token" bzw. "bot.discordToken" fehlt.');
  }
  fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2));
  return normalized;
}

function mergeGuildConfig(baseConfig, guildId) {
  const defaults = baseConfig.bot?.defaultGuild || {};
  const guildConfig = baseConfig.guilds?.[guildId] || {};
  const merged = {
    ...defaults,
    ...guildConfig,
    modRoles: Array.from(new Set([...(defaults.modRoles || []), ...(guildConfig.modRoles || [])])),
    adminRoles: Array.from(new Set([...(defaults.adminRoles || []), ...(guildConfig.adminRoles || [])])),
    event: {
      ...(defaults.event || {}),
      ...(guildConfig.event || {})
    },
    scan: {
      ...(defaults.scan || {}),
      ...(guildConfig.scan || {})
    }
  };
  return merged;
}

module.exports = {
  resolveConfigPath,
  loadConfig,
  saveConfig,
  mergeGuildConfig
};
