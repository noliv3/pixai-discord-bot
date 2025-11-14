const registerEventStart = require('./commands/event-start');
const registerEventStop = require('./commands/event-stop');
const registerEventStatus = require('./commands/event-status');
const registerEventExtend = require('./commands/event-extend');
const registerEventExport = require('./commands/event-export');
const registerMessageCreate = require('./events/message-create');
const registerReactionAdd = require('./events/message-reaction-add');
const registerReactionRemove = require('./events/message-reaction-remove');

module.exports = function registerPictureEventsModule(api) {
  registerEventStart(api);
  registerEventStop(api);
  registerEventStatus(api);
  registerEventExtend(api);
  registerEventExport(api);
  registerMessageCreate(api);
  registerReactionAdd(api);
  registerReactionRemove(api);
};
