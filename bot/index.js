const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');

const ConfigManager = require('./lib/botConfig');
const createLogger = require('./lib/logger');
const createEventStore = require('./lib/eventStore');
const createFlaggedStore = require('./lib/flaggedStore');
const createScannerClient = require('./lib/scannerClient');
const createModuleLoader = require('./lib/moduleLoader');
const createHealthCheck = require('./lib/healthCheck');
const permissions = require('./lib/permissions');
const createDmHandler = require('./lib/dmHandler');

const logger = createLogger();
const configManager = new ConfigManager({ logger });
let globalConfig;

try {
  globalConfig = configManager.loadGlobalConfig();
  logger.info('Globale Konfiguration geladen');
} catch (error) {
  logger.error('Konfiguration konnte nicht geladen werden', { error: error.message });
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.logger = logger;
client.configManager = configManager;
client.commands = new Collection();

const eventsDir = path.join(__dirname, 'data', 'events');
const dataDir = path.join(__dirname, 'data');
client.eventStore = createEventStore(eventsDir, logger);
client.flaggedStore = createFlaggedStore(dataDir, logger);
client.flaggedReviews = client.flaggedStore;
client.scanner = createScannerClient(globalConfig.scanner || {}, logger);
client.activeEvents = new Map();

if (client.scanner.isEnabled()) {
  logger.info('Scanner-Client aktiviert', { baseUrl: globalConfig.scanner.baseUrl });
} else {
  logger.warn('Scanner-Client deaktiviert. Uploads werden nicht automatisch geprüft.');
}

const modulesPath = path.join(__dirname, 'modules');
const moduleLoader = createModuleLoader({
  modulesPath,
  client,
  logger,
  configManager,
  eventStore: client.eventStore,
  flaggedStore: client.flaggedStore,
  scanner: client.scanner,
  permissions
});

moduleLoader.loadModules();

function loadCoreCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  if (!fs.existsSync(commandsPath)) return;
  const files = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const commandModule = require(path.join(commandsPath, file));
    if (!commandModule?.name || typeof commandModule.execute !== 'function') {
      logger.warn('Command-Datei ohne gültiges Interface übersprungen', { file });
      continue;
    }
    client.commands.set(commandModule.name.toLowerCase(), {
      ...commandModule,
      module: null
    });
    logger.debug('Core-Command geladen', { command: commandModule.name });
  }
}

loadCoreCommands();

moduleLoader.listCommands().forEach((command) => {
  client.commands.set(command.name.toLowerCase(), command);
});

const healthCheck = createHealthCheck({
  configManager,
  moduleLoader,
  scanner: client.scanner,
  logger,
  dataPaths: { eventsDir, dataDir }
});

client.healthCheck = healthCheck;

const dmHandler = createDmHandler({
  client,
  logger,
  configManager,
  permissions
});

function loadCoreEvents() {
  const eventsPath = path.join(__dirname, 'events');
  if (!fs.existsSync(eventsPath)) return;
  const files = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const eventModule = require(path.join(eventsPath, file));
    if (!eventModule?.name || typeof eventModule.execute !== 'function') {
      logger.warn('Event-Datei ohne gültiges Interface übersprungen', { file });
      continue;
    }
    if (eventModule.once) {
      client.once(eventModule.name, (...args) => eventModule.execute(...args, client));
    } else {
      client.on(eventModule.name, (...args) => eventModule.execute(...args, client));
    }
    logger.debug('Core-Event geladen', { event: eventModule.name });
  }
}

loadCoreEvents();

async function handleCommand(message, commandName, args) {
  const guildId = message.guild?.id || null;
  const globalCfg = configManager.getGlobalConfig();
  const guildConfig = guildId ? configManager.getGuildConfig(guildId) : null;
  const command = client.commands.get(commandName);
  if (!command) return false;
  if (!permissions.canUseCommand(message, command, globalCfg, guildConfig)) {
    await message.reply('Du hast keine Berechtigung für diesen Befehl.');
    return true;
  }
  if (command.module) {
    if (guildId && !configManager.isModuleEnabled(guildId, command.module)) {
      await message.reply('Dieses Modul ist für die Guild deaktiviert.');
      return true;
    }
    try {
      configManager.beginGuildOperation(guildId);
      await moduleLoader.runCommand(command.name, {
        message,
        args,
        client,
        guildId,
        guildConfig,
        globalConfig: globalCfg,
        configManager,
        logger,
        moduleConfig: guildConfig?.modules?.[command.module] || null
      });
    } catch (error) {
      logger.error('Fehler beim Ausführen eines Commands', { command: command.name, error: error.message });
      await message.reply('Beim Ausführen des Befehls ist ein Fehler aufgetreten.');
    } finally {
      configManager.endGuildOperation(guildId);
    }
  } else {
    try {
      configManager.beginGuildOperation(guildId);
      await command.execute(message, args, client, guildConfig, globalCfg);
    } catch (error) {
      logger.error('Fehler beim Ausführen eines Core-Commands', { command: command.name, error: error.message });
      await message.reply('Beim Ausführen des Befehls ist ein Fehler aufgetreten.');
    } finally {
      configManager.endGuildOperation(guildId);
    }
  }
  return true;
}

async function dispatchToModules(eventName, args, guildId, guildConfig, globalCfg) {
  await moduleLoader.dispatch(eventName, args, {
    client,
    configManager,
    guildId,
    guildConfig,
    globalConfig: globalCfg
  });
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const globalCfg = configManager.getGlobalConfig();
  if (!message.guild) {
    await dmHandler.handleMessage(message, globalCfg);
    return;
  }
  const prefix = globalCfg.bot.prefix || '!';
  if (message.content?.startsWith(prefix)) {
    const raw = message.content.slice(prefix.length).trim();
    const [commandName, ...args] = raw.split(/\s+/);
    if (!commandName) return;
    const handled = await handleCommand(message, commandName.toLowerCase(), args);
    if (handled) return;
  }
  const guildId = message.guild?.id;
  if (!guildId) return;
  const guildConfig = configManager.getGuildConfig(guildId);
  await dispatchToModules('messageCreate', [message], guildId, guildConfig, globalCfg);
});

async function resolveReactionContext(reaction) {
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      logger.warn('Konnte Reaction nicht vollständig laden', { error: error.message });
      return null;
    }
  }
  const message = reaction.message;
  if (!message) return null;
  return { reaction, message };
}

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  const context = await resolveReactionContext(reaction);
  if (!context) return;
  const { message } = context;
  const guildId = message.guild?.id;
  if (!guildId) return;
  const globalCfg = configManager.getGlobalConfig();
  const guildConfig = configManager.getGuildConfig(guildId);
  await dispatchToModules('messageReactionAdd', [reaction, user], guildId, guildConfig, globalCfg);
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  const context = await resolveReactionContext(reaction);
  if (!context) return;
  const { message } = context;
  const guildId = message.guild?.id;
  if (!guildId) return;
  const globalCfg = configManager.getGlobalConfig();
  const guildConfig = configManager.getGuildConfig(guildId);
  await dispatchToModules('messageReactionRemove', [reaction, user], guildId, guildConfig, globalCfg);
});

async function startBot() {
  const preflight = await healthCheck.runAll();
  if (preflight.summary === 'error') {
    logger.error('HealthCheck meldet Fehler – Bot wird nicht gestartet.');
    process.exit(1);
  }
  try {
    await client.login(globalConfig.bot.token);
  } catch (error) {
    logger.error('Login fehlgeschlagen', { error: error.message });
    process.exit(1);
  }
}

startBot();
