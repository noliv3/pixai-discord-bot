const fs = require('fs');
const path = require('path');

const GLOBAL_CONFIG_FILENAME = 'bot-global.json';
const GUILD_CONFIG_DIRNAME = 'guilds';

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function normalizeOwners(bot = {}) {
  const ownerIds = [...new Set([...toArray(bot.owners), ...toArray(bot.ownerIds)])];
  return { ...bot, owners: ownerIds, ownerIds };
}

function normalizeScanner(scanner = {}) {
  const normalized = { ...scanner };
  if (!normalized.baseUrl && normalized.url) {
    normalized.baseUrl = normalized.url;
  }
  if (normalized.baseUrl && !normalized.url) {
    normalized.url = normalized.baseUrl;
  }
  if (!normalized.clientId && normalized.email) {
    normalized.clientId = normalized.email;
  }
  if (normalized.clientId && !normalized.email) {
    normalized.email = normalized.clientId;
  }
  return normalized;
}

function parseInvitePermissions(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readJson(filePath, fallback = {}) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

class ConfigManager {
  constructor({ basePath, logger } = {}) {
    this.basePath = basePath || path.join(__dirname, '..', 'config');
    this.logger = logger;
    this.globalPath = path.join(this.basePath, GLOBAL_CONFIG_FILENAME);
    this.guildsPath = path.join(this.basePath, GUILD_CONFIG_DIRNAME);
    this.cache = {
      global: null,
      globalMeta: null,
      guilds: new Map()
    };
    this.moduleDefinitions = new Map();
    this.guildLocks = new Set();
    fs.mkdirSync(this.guildsPath, { recursive: true });
  }

  registerModule(manifest) {
    if (!manifest?.name) return;
    const moduleName = manifest.name;
    const definition = {
      name: moduleName,
      enabledByDefault: manifest.enabledByDefault !== false,
      defaultConfig: manifest.defaultConfig || {},
      description: manifest.description || ''
    };
    this.moduleDefinitions.set(moduleName, definition);
    for (const [guildId, entry] of this.cache.guilds.entries()) {
      const updated = this._applyModuleDefaults({ ...entry.data }, moduleName);
      entry.data = updated;
      this.cache.guilds.set(guildId, entry);
    }
  }

  beginGuildOperation(guildId) {
    if (guildId) {
      this.guildLocks.add(guildId);
    }
  }

  endGuildOperation(guildId) {
    if (guildId) {
      this.guildLocks.delete(guildId);
    }
  }

  loadGlobalConfig(force = false) {
    if (!force && this.cache.global && !this._needsReload(this.globalPath, this.cache.globalMeta)) {
      return this.cache.global;
    }
    const config = readJson(this.globalPath, null);
    if (!config) {
      throw new Error(`Globale Konfiguration nicht gefunden: ${this.globalPath}`);
    }
    const bot = normalizeOwners({ ...(config.bot || {}) });
    bot.prefix = bot.prefix || '!';
    if (!bot.token && bot.discordToken) {
      bot.token = bot.discordToken;
    }
    if (bot.token && !bot.discordToken) {
      bot.discordToken = bot.token;
    }
    if (!bot.clientId) {
      bot.clientId =
        bot.applicationId ||
        process.env.BOT_CLIENT_ID ||
        process.env.DISCORD_CLIENT_ID ||
        process.env.DISCORD_APPLICATION_ID ||
        null;
    }
    if (bot.clientId && !bot.applicationId) {
      bot.applicationId = bot.clientId;
    }
    const envInvitePermissions =
      process.env.BOT_INVITE_PERMISSIONS || process.env.DISCORD_INVITE_PERMISSIONS || null;
    const parsedEnvInvite = parseInvitePermissions(envInvitePermissions);
    const parsedConfigInvite = parseInvitePermissions(bot.invitePermissions);
    if (parsedConfigInvite !== undefined) {
      bot.invitePermissions = parsedConfigInvite;
    } else if (parsedEnvInvite !== undefined) {
      bot.invitePermissions = parsedEnvInvite;
    }
    const scanner = normalizeScanner(config.scanner || {});
    const defaults = config.defaults || {};

    const normalized = {
      ...config,
      bot,
      scanner,
      defaults
    };

    if (!normalized.bot.token) {
      throw new Error('Globale Konfiguration: Feld "bot.token" fehlt.');
    }

    this.cache.global = normalized;
    this.cache.globalMeta = this._statFile(this.globalPath);
    return normalized;
  }

  getGlobalConfig() {
    return this.loadGlobalConfig(false);
  }

  listGuildIds() {
    const files = fs.readdirSync(this.guildsPath, { withFileTypes: true });
    return files
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.basename(entry.name, '.json'));
  }

  ensureGuildConfig(guildId) {
    const filePath = this._guildConfigPath(guildId);
    if (!fs.existsSync(filePath)) {
      const defaults = this._createGuildDefaults(guildId);
      writeJson(filePath, defaults);
      this.cache.guilds.set(guildId, {
        data: defaults,
        meta: this._statFile(filePath)
      });
      if (this.logger) {
        this.logger.info('Neue Guild-Konfiguration erstellt', { guildId });
      }
      return defaults;
    }
    return this.getGuildConfig(guildId, { force: true });
  }

  getGuildConfig(guildId, options = {}) {
    if (!guildId) return null;
    const { force = false } = options;
    const filePath = this._guildConfigPath(guildId);
    if (!fs.existsSync(filePath)) {
      return this.ensureGuildConfig(guildId);
    }
    const cached = this.cache.guilds.get(guildId);
    if (!force && cached && !this._needsReload(filePath, cached.meta)) {
      return cached.data;
    }
    if (this.guildLocks.has(guildId) && cached && !force) {
      return cached.data;
    }
    const raw = readJson(filePath, {});
    const normalized = this._normalizeGuildConfig(raw, guildId);
    this.cache.guilds.set(guildId, {
      data: normalized,
      meta: this._statFile(filePath)
    });
    return normalized;
  }

  saveGuildConfig(guildId, data) {
    if (!guildId) {
      throw new Error('Guild-ID wird benötigt, um Konfiguration zu speichern.');
    }
    const filePath = this._guildConfigPath(guildId);
    const normalized = this._normalizeGuildConfig(data, guildId);
    writeJson(filePath, normalized);
    this.cache.guilds.set(guildId, {
      data: normalized,
      meta: this._statFile(filePath)
    });
    return normalized;
  }

  updateGuildConfig(guildId, updater) {
    const current = this.getGuildConfig(guildId) || this._createGuildDefaults(guildId);
    const updated = updater({ ...current }) || current;
    return this.saveGuildConfig(guildId, updated);
  }

  getModuleConfig(guildId, moduleName) {
    const guildConfig = this.getGuildConfig(guildId);
    return guildConfig?.modules?.[moduleName] || null;
  }

  isModuleEnabled(guildId, moduleName) {
    if (!moduleName) return true;
    const moduleConfig = this.getModuleConfig(guildId, moduleName);
    if (moduleConfig && typeof moduleConfig.enabled === 'boolean') {
      return moduleConfig.enabled;
    }
    const definition = this.moduleDefinitions.get(moduleName);
    if (definition) {
      return definition.enabledByDefault;
    }
    return true;
  }

  _guildConfigPath(guildId) {
    return path.join(this.guildsPath, `${guildId}.json`);
  }

  _statFile(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return { mtimeMs: stats.mtimeMs };
    } catch (error) {
      return null;
    }
  }

  _needsReload(filePath, meta) {
    if (!meta) return true;
    try {
      const stats = fs.statSync(filePath);
      return stats.mtimeMs !== meta.mtimeMs;
    } catch (error) {
      return true;
    }
  }

  _createGuildDefaults(guildId) {
    const globalConfig = this.getGlobalConfig();
    const defaults = globalConfig?.defaults?.guild || {};
    const base = {
      guildId,
      channels: {
        events: null,
        modLog: null,
        ...((defaults.channels && typeof defaults.channels === 'object') ? defaults.channels : {})
      },
      roles: {
        admins: [],
        moderators: [],
        ...((defaults.roles && typeof defaults.roles === 'object') ? defaults.roles : {})
      },
      scan: this._normalizeScanConfig(defaults.scan),
      modules: {}
    };

    for (const moduleName of this.moduleDefinitions.keys()) {
      base.modules[moduleName] = this._buildModuleDefault(moduleName, defaults.modules?.[moduleName]);
    }

    return base;
  }

  _normalizeScanConfig(scan, fallback) {
    const defaultScan = {
      enabled: true,
      thresholds: {
        flag: 0.6,
        delete: 0.95
      },
      ...((fallback && typeof fallback === 'object') ? fallback : {})
    };
    if (!scan) return defaultScan;
    const thresholds = scan.thresholds || {};
    return {
      enabled: typeof scan.enabled === 'boolean' ? scan.enabled : defaultScan.enabled,
      reviewChannelId: scan.reviewChannelId ?? defaultScan.reviewChannelId ?? null,
      thresholds: {
        flag: Number.isFinite(scan.flagThreshold) ? scan.flagThreshold : thresholds.flag ?? defaultScan.thresholds.flag,
        delete: Number.isFinite(scan.deleteThreshold)
          ? scan.deleteThreshold
          : thresholds.delete ?? defaultScan.thresholds.delete
      }
    };
  }

  _normalizeGuildConfig(config, guildId) {
    const defaults = this._createGuildDefaults(guildId);
    const normalized = {
      ...defaults,
      ...config
    };

    normalized.guildId = guildId;

    const channels = normalized.channels || {};
    normalized.channels = {
      ...defaults.channels,
      ...channels,
      events: channels.events ?? channels.eventChannelId ?? defaults.channels.events,
      modLog: channels.modLog ?? channels.logChannelId ?? defaults.channels.modLog
    };

    const roles = normalized.roles || {};
    normalized.roles = {
      ...defaults.roles,
      admins: Array.from(new Set([...(roles.admins || []), ...(normalized.adminRoles || [])])),
      moderators: Array.from(new Set([...(roles.moderators || []), ...(normalized.modRoles || [])]))
    };

    normalized.scan = this._normalizeScanConfig(normalized.scan || config?.scan, defaults.scan);

    delete normalized.adminRoles;
    delete normalized.modRoles;
    if (config?.event && !normalized.modules['picture-events']) {
      normalized.modules['picture-events'] = this._buildModuleDefault('picture-events');
      normalized.modules['picture-events'] = {
        ...normalized.modules['picture-events'],
        ...this._adaptLegacyEventConfig(config.event)
      };
    }

    normalized.modules = normalized.modules || {};
    for (const moduleName of this.moduleDefinitions.keys()) {
      normalized.modules[moduleName] = this._applyModuleDefaultsToConfig(
        normalized.modules[moduleName],
        moduleName,
        config?.modules?.[moduleName]
      );
    }

    return normalized;
  }

  _buildModuleDefault(moduleName, overrides) {
    const definition = this.moduleDefinitions.get(moduleName) || {};
    const defaults = {
      enabled: definition.enabledByDefault !== false,
      ...JSON.parse(JSON.stringify(definition.defaultConfig || {}))
    };
    if (overrides && typeof overrides === 'object') {
      return { ...defaults, ...overrides };
    }
    return defaults;
  }

  _applyModuleDefaults(config, moduleName) {
    const current = config.modules || {};
    current[moduleName] = this._applyModuleDefaultsToConfig(current[moduleName], moduleName);
    return { ...config, modules: current };
  }

  _applyModuleDefaultsToConfig(current, moduleName, legacy = null) {
    const merged = this._buildModuleDefault(moduleName);
    const source = legacy || current || {};
    if (source && typeof source === 'object') {
      Object.assign(merged, source);
      if (merged.thresholds && source.flagThreshold && !source.thresholds?.flag) {
        merged.thresholds.flag = Number.parseFloat(source.flagThreshold) || merged.thresholds.flag;
      }
      if (merged.thresholds && source.deleteThreshold && !source.thresholds?.delete) {
        merged.thresholds.delete = Number.parseFloat(source.deleteThreshold) || merged.thresholds.delete;
      }
    }
    return merged;
  }

  _adaptLegacyEventConfig(eventConfig = {}) {
    const { enabled, defaultDurationHours, maxEntriesPerUser, voteEmojis, archiveAfterStop } = eventConfig;
    const normalized = {};
    if (typeof enabled === 'boolean') {
      normalized.enabled = enabled;
    }
    if (Number.isFinite(defaultDurationHours)) {
      normalized.defaultDurationHours = defaultDurationHours;
    }
    if (Number.isFinite(maxEntriesPerUser)) {
      normalized.maxEntriesPerUser = maxEntriesPerUser;
    }
    if (typeof archiveAfterStop === 'boolean') {
      normalized.archiveAfterStop = archiveAfterStop;
    }
    if (voteEmojis && typeof voteEmojis === 'object') {
      normalized.voteEmojis = voteEmojis;
    }
    return normalized;
  }
}

module.exports = ConfigManager;
