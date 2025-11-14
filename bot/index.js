const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');

const createLogger = require('./lib/logger');
const { loadConfig, mergeGuildConfig } = require('./lib/botConfig');
const createEventStore = require('./lib/eventStore');
const createFlaggedStore = require('./lib/flaggedStore');
const createScannerClient = require('./lib/scannerClient');

const logger = createLogger();
let config;

try {
  config = loadConfig();
  logger.info('Konfiguration geladen');
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
client.config = config;
client.commands = new Collection();
client.guildConfigs = new Map();
client.eventStore = createEventStore(path.join(__dirname, 'data', 'events'), logger);
client.flaggedStore = createFlaggedStore(path.join(__dirname, 'data'), logger);
client.flaggedReviews = client.flaggedStore;
client.scanner = createScannerClient(config.scanner || {}, logger);
client.activeEvents = new Map();

if (client.scanner.isEnabled()) {
  logger.info('Scanner-Client aktiviert', { baseUrl: config.scanner.baseUrl });
} else {
  logger.warn('Scanner-Client deaktiviert. Uploads werden nicht automatisch geprüft.');
}

function loadGuildConfigs() {
  const guildIds = Object.keys(config.guilds || {});
  guildIds.forEach((guildId) => {
    const guildConfig = mergeGuildConfig(config, guildId);
    client.guildConfigs.set(guildId, guildConfig);
  });
  logger.info('Guild-Konfigurationen vorbereitet', { guildCount: client.guildConfigs.size });
}

function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  const files = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const commandModule = require(path.join(commandsPath, file));
    if (commandModule?.name && typeof commandModule.execute === 'function') {
      client.commands.set(commandModule.name, commandModule);
      logger.debug('Command geladen', { command: commandModule.name });
    } else {
      logger.warn('Command-Datei ohne gültiges Interface übersprungen', { file });
    }
  }
}

function loadEvents() {
  const eventsPath = path.join(__dirname, 'events');
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
    logger.debug('Event geladen', { event: eventModule.name });
  }
}

loadGuildConfigs();
loadCommands();
loadEvents();

client.login(config.bot.token).catch((error) => {
  logger.error('Login fehlgeschlagen', { error: error.message });
  process.exit(1);
});
