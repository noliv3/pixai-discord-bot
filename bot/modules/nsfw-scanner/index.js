const registerMessageCreate = require('./events/message-create');
const registerReactionAdd = require('./events/message-reaction-add');
const registerReactionRemove = require('./events/message-reaction-remove');

module.exports = function registerNsfwScannerModule(api) {
  registerMessageCreate(api);
  registerReactionAdd(api);
  registerReactionRemove(api);
};
