const scannerConfig = require('../lib/scannerConfig');

module.exports = {
    name: 'setscan',
    description: 'Adjust scan thresholds',
    execute(message, client, args) {
        if (args.length < 2) {
            message.reply('Usage: !setscan <flagThreshold> <deleteThreshold>');
            return;
        }
        const flag = parseFloat(args[0]);
        const del = parseFloat(args[1]);
        if (Number.isNaN(flag) || Number.isNaN(del)) {
            message.reply('Both thresholds must be numbers.');
            return;
        }
        scannerConfig.update(flag, del);
        const cfg = scannerConfig.get();
        message.channel.send(`Scan thresholds set: flag=${cfg.flagThreshold}, delete=${cfg.deleteThreshold}`);
    }
};
