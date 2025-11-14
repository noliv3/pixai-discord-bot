const fs = require('fs');

function resolveStatus(issues) {
  if (issues.some((entry) => entry.level === 'error')) return 'error';
  if (issues.some((entry) => entry.level === 'warn')) return 'warn';
  return 'ok';
}

function checkRequiredFields(globalConfig) {
  const issues = [];
  if (!globalConfig?.bot?.token) {
    issues.push({ level: 'error', message: 'bot.token fehlt in der globalen Konfiguration.' });
  }
  if (!globalConfig?.bot?.prefix) {
    issues.push({ level: 'warn', message: 'bot.prefix ist nicht gesetzt. Fallback "!" wird genutzt.' });
  }
  if (!Array.isArray(globalConfig?.bot?.owners) || globalConfig.bot.owners.length === 0) {
    issues.push({ level: 'warn', message: 'Keine Bot-Owner in der globalen Konfiguration definiert.' });
  }
  if (!globalConfig?.scanner?.baseUrl) {
    issues.push({ level: 'warn', message: 'Scanner-Endpoint (scanner.baseUrl) ist nicht gesetzt.' });
  }
  return issues;
}

function validateGuildConfig(guildId, config, moduleDefinitions) {
  const issues = [];
  if (!config) {
    issues.push({ level: 'error', message: 'Konfiguration konnte nicht geladen werden.', guildId });
    return issues;
  }
  if (!config.channels?.events || !config.channels?.modLog) {
    issues.push({
      level: 'warn',
      message: 'Guild-Konfiguration sollte Event- und Mod-Log-Channels definieren.',
      guildId
    });
  }
  if (!config.roles?.admins?.length) {
    issues.push({
      level: 'warn',
      message: 'Keine Admin-Rollen in Guild-Konfiguration gesetzt.',
      guildId
    });
  }
  if (!config.scan) {
    issues.push({ level: 'warn', message: 'Scan-Konfiguration fehlt.', guildId });
  } else if (!config.scan.thresholds) {
    issues.push({ level: 'warn', message: 'Scan-Thresholds fehlen.', guildId });
  }
  for (const [moduleName, definition] of moduleDefinitions.entries()) {
    const moduleConfig = config.modules?.[moduleName];
    if (!moduleConfig) {
      issues.push({
        level: 'warn',
        message: `Modul "${moduleName}" fehlt in der Guild-Konfiguration.`,
        guildId
      });
      continue;
    }
    if (typeof moduleConfig.enabled !== 'boolean') {
      issues.push({
        level: 'warn',
        message: `Modul "${moduleName}" besitzt kein Feld "enabled".`,
        guildId
      });
    }
    if (definition.defaultConfig && typeof definition.defaultConfig === 'object') {
      for (const key of Object.keys(definition.defaultConfig)) {
        if (!(key in moduleConfig)) {
          issues.push({
            level: 'warn',
            message: `Modul "${moduleName}" Konfig-Feld "${key}" fehlt.`,
            guildId
          });
        }
      }
    }
  }
  return issues;
}

function directoryWritable(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = function createHealthCheck({ configManager, moduleLoader, scanner, logger, dataPaths = {} }) {
  async function checkConfigIntegrity() {
    const issues = [];
    try {
      const globalConfig = configManager.getGlobalConfig();
      issues.push(...checkRequiredFields(globalConfig));
      const guildIds = configManager.listGuildIds();
      const moduleDefinitions = moduleLoader.getManifests();
      for (const guildId of guildIds) {
        try {
          const config = configManager.getGuildConfig(guildId, { force: true });
          issues.push(...validateGuildConfig(guildId, config, moduleDefinitions));
        } catch (error) {
          issues.push({ level: 'error', message: error.message, guildId });
        }
      }
    } catch (error) {
      issues.push({ level: 'error', message: error.message });
    }
    return { status: resolveStatus(issues), issues };
  }

  async function checkScannerConnectivity() {
    const issues = [];
    try {
      const globalConfig = configManager.getGlobalConfig();
      const baseUrl = globalConfig?.scanner?.baseUrl;
      if (!baseUrl) {
        issues.push({ level: 'warn', message: 'Kein Scanner konfiguriert.' });
        return { status: resolveStatus(issues), issues };
      }
      if (!scanner?.isEnabled?.()) {
        issues.push({ level: 'error', message: 'Scanner-Client ist deaktiviert.' });
        return { status: resolveStatus(issues), issues };
      }
      const response = await scanner.getStats();
      if (!response?.ok) {
        issues.push({
          level: 'error',
          message: `Scanner nicht erreichbar (${response?.status || 'n/a'}): ${response?.error || ''}`.trim()
        });
      }
    } catch (error) {
      issues.push({ level: 'error', message: `Scanner-Check fehlgeschlagen: ${error.message}` });
    }
    return { status: resolveStatus(issues), issues };
  }

  function checkModules() {
    const issues = [];
    const manifests = moduleLoader.getManifests();
    const commands = moduleLoader.listCommands();
    const events = moduleLoader.listEventHandlers();
    const commandIndex = new Map(commands.map((command) => [command.name.toLowerCase(), command]));
    for (const [moduleName, manifest] of manifests.entries()) {
      if (!manifest.description) {
        issues.push({ level: 'warn', message: `Modul "${moduleName}" besitzt keine Beschreibung.` });
      }
      if (Array.isArray(manifest.commands)) {
        for (const commandName of manifest.commands) {
          const command = commandIndex.get(commandName.toLowerCase());
          if (!command || command.module !== moduleName) {
            issues.push({
              level: 'warn',
              message: `Command "${commandName}" aus Modul "${moduleName}" wurde nicht registriert.`
            });
          }
        }
      }
      if (Array.isArray(manifest.events)) {
        for (const eventName of manifest.events) {
          const handlers = events.get(eventName) || [];
          if (!handlers.some((entry) => entry.module === moduleName)) {
            issues.push({
              level: 'warn',
              message: `Event "${eventName}" aus Modul "${moduleName}" besitzt keinen Handler.`
            });
          }
        }
      }
    }
    return { status: resolveStatus(issues), issues };
  }

  function checkRuntime() {
    const issues = [];
    const { eventsDir, dataDir } = dataPaths;
    if (eventsDir && !directoryWritable(eventsDir)) {
      issues.push({ level: 'error', message: `Events-Verzeichnis nicht beschreibbar: ${eventsDir}` });
    }
    if (dataDir && !directoryWritable(dataDir)) {
      issues.push({ level: 'error', message: `Datenverzeichnis nicht beschreibbar: ${dataDir}` });
    }
    return { status: resolveStatus(issues), issues };
  }

  async function runAll() {
    const sections = {
      config: await checkConfigIntegrity(),
      scanner: await checkScannerConnectivity(),
      modules: checkModules(),
      runtime: checkRuntime()
    };
    const summary = resolveStatus(
      Object.values(sections).flatMap((section) => section.issues)
    );
    logger?.info('HealthCheck abgeschlossen', { summary });
    return { summary, sections };
  }

  return {
    checkConfigIntegrity,
    checkScannerConnectivity,
    checkModules,
    checkRuntime,
    runAll
  };
};
