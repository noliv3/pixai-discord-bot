// events/messageReactionAdd.js
const { handleReactionAdd } = require('../lib/handleReactionAdd');

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user, client) {
    try {
      // Partials nachladen, damit IDs & Channel immer vorhanden sind
      if (reaction.partial)           await reaction.fetch().catch(() => null);
      if (reaction.message.partial)   await reaction.message.fetch().catch(() => null);

      // Jetzt den eigentlichen Handler aufrufen – *mit* client
      await handleReactionAdd(reaction, user, client);
    } catch (err) {
      console.error('[messageReactionAdd] Error:', err);
    }
  }
};
