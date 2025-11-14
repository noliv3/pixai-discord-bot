const fs = require('fs');
const path = require('path');

function buildModuleApi({ moduleName, client, logger, configManager, eventStore, flaggedStore, scanner, permissions, registerCommand, registerEventHandler }) {
  return {
    name: moduleName,
    client,
    logger,
    configManager,
    eventStore,
    flaggedStore,
    scanner,
    permissions,
    registerCommand,
    registerEventHandler,
    getModuleConfig(guildId) {
      return configManager.getModuleConfig(guildId, moduleName);
    },
    isEnabled(guildId) {
      return configManager.isModuleEnabled(guildId, moduleName);
    }
  };
}

function createModuleLoader(options) {
  const {
    modulesPath,
    client,
    logger,
    configManager,
    eventStore,
    flaggedStore,
    scanner,
    permissions
  } = options;

  const manifests = new Map();
  const commands = new Map();
  const events = new Map();

  function registerCommand(moduleName, command) {
    if (!command?.name || typeof command.execute !== 'function') {
      logger?.warn?.('Ungültiger Command-Handler registriert', { module: moduleName });
      return;
    }
    const key = command.name.toLowerCase();
    if (commands.has(key)) {
      logger?.warn?.('Command-Name mehrfach registriert – überschreibe bestehenden Eintrag', {
        command: key,
        previousModule: commands.get(key).module,
        module: moduleName
      });
    }
    commands.set(key, {
      ...command,
      module: moduleName
    });
  }

  function registerEventHandler(moduleName, eventName, handler) {
    if (!eventName || typeof handler !== 'function') {
      logger?.warn?.('Ungültiger Event-Handler registriert', { module: moduleName });
      return;
    }
    const entry = events.get(eventName) || [];
    entry.push({ module: moduleName, handler });
    events.set(eventName, entry);
  }

  function discoverManifests() {
    if (!fs.existsSync(modulesPath)) {
      return [];
    }
    const entries = fs.readdirSync(modulesPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  function loadModules() {
    const moduleNames = discoverManifests();
    for (const folderName of moduleNames) {
      const manifestPath = path.join(modulesPath, folderName, 'module.json');
      const manifest = readManifest(manifestPath, folderName, logger);
      if (!manifest) continue;
      manifests.set(manifest.name, manifest);
      configManager.registerModule(manifest);
      const indexPath = path.join(modulesPath, folderName, 'index.js');
      if (!fs.existsSync(indexPath)) {
        logger?.warn?.('Modul ohne index.js gefunden', { module: manifest.name });
        continue;
      }
      try {
        const factory = require(indexPath);
        if (typeof factory !== 'function') {
          logger?.warn?.('Modul exportiert keine Funktion', { module: manifest.name });
          continue;
        }
        const api = buildModuleApi({
          moduleName: manifest.name,
          client,
          logger,
          configManager,
          eventStore,
          flaggedStore,
          scanner,
          permissions,
          registerCommand: (command) => registerCommand(manifest.name, command),
          registerEventHandler: (eventName, handler) => registerEventHandler(manifest.name, eventName, handler)
        });
        factory(api);
        logger?.info?.('Modul geladen', { module: manifest.name });
      } catch (error) {
        logger?.error?.('Modul konnte nicht geladen werden', { module: manifest.name, error: error.message });
      }
    }
  }

  async function runCommand(commandName, context) {
    const key = commandName.toLowerCase();
    const command = commands.get(key);
    if (!command) {
      return false;
    }
    const guildId = context.guildId;
    if (guildId && !configManager.isModuleEnabled(guildId, command.module)) {
      return false;
    }
    try {
      await Promise.resolve(command.execute({ ...context, command }));
    } catch (error) {
      logger?.error?.('Fehler beim Ausführen eines Commands', {
        command: command.name,
        module: command.module,
        error: error.message
      });
      throw error;
    }
    return true;
  }

  async function dispatch(eventName, args, meta = {}) {
    const handlers = events.get(eventName);
    if (!handlers || handlers.length === 0) {
      return;
    }
    for (const { module: moduleName, handler } of handlers) {
      if (meta.guildId && !configManager.isModuleEnabled(meta.guildId, moduleName)) {
        continue;
      }
      try {
        await Promise.resolve(
          handler({
            ...meta,
            args,
            module: moduleName,
            moduleConfig: meta.guildConfig?.modules?.[moduleName] || null
          })
        );
      } catch (error) {
        logger?.error?.('Fehler in Modul-Eventhandler', {
          module: moduleName,
          event: eventName,
          error: error.message
        });
      }
    }
  }

  function getCommand(commandName) {
    if (!commandName) return null;
    return commands.get(commandName.toLowerCase()) || null;
  }

  function listCommands() {
    return Array.from(commands.values());
  }

  function getManifests() {
    return manifests;
  }

  function listEventHandlers() {
    const snapshot = new Map();
    for (const [eventName, handlers] of events.entries()) {
      snapshot.set(
        eventName,
        handlers.map((entry) => ({ module: entry.module }))
      );
    }
    return snapshot;
  }

  return {
    loadModules,
    runCommand,
    dispatch,
    getCommand,
    listCommands,
    getManifests,
    listEventHandlers
  };
}

function readManifest(manifestPath, folderName, logger) {
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.name) {
      parsed.name = folderName;
    }
    return parsed;
  } catch (error) {
    logger?.error?.('module.json konnte nicht gelesen werden', { path: manifestPath, error: error.message });
    return null;
  }
}

module.exports = createModuleLoader;
