const registerScanConfigCommands = require('./commands/scan-config');
const registerMessageCreate = require('./events/message-create');

module.exports = function registerTagScanModule(api) {
  registerScanConfigCommands(api);
  registerMessageCreate(api);
};
