// /commands/filter.js

const scannerConfig = require('../lib/scannerConfig');
const { logModReview } = require('../lib/modLogger');

module.exports = {
    name: 'filter',
    async execute(message, client, args) {
        if (!message.guild || message.author.bot) return;

        const cfg = scannerConfig.get();
        const member = message.guild.members.cache.get(message.author.id);
        const isMod = (cfg.moderatorRoleId && member.roles.cache.has(cfg.moderatorRoleId)) ||
                      member.permissions.has('ManageMessages');
        if (!isMod) {
            logModReview(`[filter] ${message.author.tag} no permission`);
            return;
        }

        if (args.length === 0) return;

        // === show existing filter tags ===
        if (args[0].toLowerCase() === 'show') {
            const level = args[1];
            if (!['0','1','2','3'].includes(level)) return;

            const list = cfg.tagFilters?.[level] || [];
            await message.delete().catch(() => {});
            const text = list.length
                ? list.map(t => `\`${t}\``).join(', ')
                : 'keine Einträge';
            await message.channel.send(`FILTER (${level}): ${text}`);
            return;
        }

        // === add/remove a tag ===
        if (args.length < 2) return;
        const category = args[0];
        const op       = args[1][0];
        const tag      = args[1].slice(1).toLowerCase().trim();
        if (!['0','1','2','3'].includes(category) || !['+','-'].includes(op) || !tag) return;

        if (!cfg.tagFilters) {
            cfg.tagFilters = { "0": [], "1": [], "2": [], "3": [] };
        }
        if (!Array.isArray(cfg.tagFilters[category])) {
            cfg.tagFilters[category] = [];
        }

        const list = cfg.tagFilters[category];
        let action = '';
        if (op === '+' && !list.includes(tag)) {
            list.push(tag);
            action = 'added';
        }
        if (op === '-' && list.includes(tag)) {
            list.splice(list.indexOf(tag), 1);
            action = 'removed';
        }

        await message.delete().catch(() => {});

        if (!action) {
            await message.channel.send(`FILTER (${category}): nothing to ${op === '+' ? 'add' : 'remove'} for \`${tag}\`.`);
            logModReview(`[filter] ${message.author.tag} no change for ${op}${tag}`);
            return;
        }

        scannerConfig.save();
        logModReview(`[filter] ${message.author.tag} ${action} ${tag} in level ${category}`);

        const symbol = op;
        await message.channel.send(`FILTER (${category}): ${symbol} \`${tag}\` ${action}`);
    }
};
