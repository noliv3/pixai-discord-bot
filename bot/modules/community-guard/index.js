const registerReactionAdd = require('./events/message-reaction-add');
const registerReactionRemove = require('./events/message-reaction-remove');

module.exports = function registerCommunityGuardModule(api) {
  registerReactionAdd(api);
  registerReactionRemove(api);
};
