const { Client, GatewayIntentBits, Partials, Collection,REST } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const { loadFlaggedReviews, saveFlaggedReviews } = require('./lib/flaggedStore');
const { get } = require('./lib/scannerConfig');

const token  = get().discordToken;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [ Partials.Message, Partials.Channel, Partials.Reaction ]
});
/* ➜  NEU: REST-Helfer an den Client hängen  */
client.rest = new REST({ version: '10' }).setToken(token);

/* ───── globale Maps ───── */
client.activeEvents   = new Map();
client.flaggedReviews = loadFlaggedReviews() || new Map();

/* ───── Persistenz ───── */
const persist = () => saveFlaggedReviews(client.flaggedReviews);
process.once('exit',   persist);
['SIGINT','SIGTERM'].forEach(sig => process.once(sig, () => { persist(); process.exit(0); }));

/* ───── Ordner für gelöschte Uploads ───── */
fs.mkdirSync(path.join(__dirname, 'deleted'), { recursive: true });

/* ───── Commands / Events laden ───── */
client.commands = new Collection();
for (const f of fs.readdirSync('./commands').filter(x => x.endsWith('.js'))) {
  const cmd = require(`./commands/${f}`);  if (cmd?.name) client.commands.set(cmd.name, cmd);
}
for (const f of fs.readdirSync('./events').filter(x => x.endsWith('.js'))) {
  const evt = require(`./events/${f}`);
  if (evt?.name && typeof evt.execute === 'function') {
    const h = (...a) => evt.execute(...a, client);
    evt.once ? client.once(evt.name, h) : client.on(evt.name, h);
  }
}

client.login(token);
