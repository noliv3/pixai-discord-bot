module.exports = function registerScanConfigCommands(api) {
  const { registerCommand, configManager, logger } = api;

  async function updateThresholds(context) {
    const { message, args, guildId, moduleConfig } = context;
    if (!guildId) {
      await message.reply('Dieser Befehl kann nur innerhalb einer Guild verwendet werden.');
      return;
    }
    if (args.length < 2) {
      await message.reply('Bitte gib zwei Schwellenwerte an, z. B. `!scanconfig 0.6 0.95`.');
      return;
    }
    const flagThreshold = Number.parseFloat(args[0]);
    const deleteThreshold = Number.parseFloat(args[1]);
    if (!Number.isFinite(flagThreshold) || !Number.isFinite(deleteThreshold)) {
      await message.reply('Ungültige Zahlenwerte.');
      return;
    }

    const currentModule = moduleConfig || {};
    const nextModuleConfig = {
      ...currentModule,
      thresholds: {
        ...(currentModule.thresholds || {}),
        flag: flagThreshold,
        delete: deleteThreshold
      }
    };

    configManager.updateGuildConfig(guildId, (config) => {
      config.scan = config.scan || {};
      config.scan.thresholds = {
        ...(config.scan.thresholds || {}),
        flag: flagThreshold,
        delete: deleteThreshold
      };
      config.modules = config.modules || {};
      config.modules['tag-scan'] = {
        ...(config.modules['tag-scan'] || {}),
        ...nextModuleConfig
      };
      return config;
    });

    logger?.info?.('Scan-Thresholds aktualisiert', {
      guildId,
      flagThreshold,
      deleteThreshold
    });
    await message.reply(
      `Schwellenwerte aktualisiert: Flag ${flagThreshold.toFixed(2)}, Delete ${deleteThreshold.toFixed(2)}.`
    );
  }

  async function showThresholds(context) {
    const { message, guildId, moduleConfig, guildConfig } = context;
    if (!guildId) {
      await message.reply('Dieser Befehl kann nur innerhalb einer Guild verwendet werden.');
      return;
    }
    const thresholds = moduleConfig?.thresholds || guildConfig?.scan?.thresholds || {};
    await message.reply(
      `Aktuelle Schwellenwerte: Flag ${Number(thresholds.flag ?? 0.6).toFixed(2)}, Delete ${Number(
        thresholds.delete ?? 0.95
      ).toFixed(2)}.`
    );
  }

  const commandDefinition = {
    description: 'Passt die Schwellenwerte für den Scanner an oder zeigt sie an.',
    requiredPermissions: ['ADMIN'],
    usage: '!scanconfig <flagThreshold> <deleteThreshold>',
    async execute(context) {
      if (context.args.length === 0) {
        await showThresholds(context);
      } else if (context.args.length === 1) {
        await showThresholds(context);
      } else {
        await updateThresholds(context);
      }
    }
  };

  registerCommand({
    name: 'scanconfig',
    ...commandDefinition
  });

  registerCommand({
    name: 'setscan',
    ...commandDefinition
  });
};
