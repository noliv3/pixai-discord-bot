const fs = require('fs');
const path = require('path');

const CONFIG_FILENAME = 'bot-config.json';

function resolveConfigPath() {
  return path.join(__dirname, '..', 'config', CONFIG_FILENAME);
}

function loadConfig() {
  const configPath = resolveConfigPath();
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed.bot || !parsed.bot.token) {
    throw new Error('bot-config.json: Feld "bot.token" fehlt.');
  }
  if (!parsed.bot.prefix) {
    parsed.bot.prefix = '!';
  }
  parsed.bot.owners = Array.isArray(parsed.bot.owners) ? parsed.bot.owners : [];
  parsed.guilds = parsed.guilds || {};
  return parsed;
}

function saveConfig(config) {
  const configPath = resolveConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
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
