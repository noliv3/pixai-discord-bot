module.exports = {
  name: 'health',
  description: 'Führt einen Gesundheitscheck aus und gibt den Status zurück.',
  requiredPermissions: ['ADMIN'],
  usage: '!health',
  async execute(message, args, client) {
    try {
      const result = await client.healthCheck.runAll();
      const lines = [`Gesamtstatus: **${result.summary.toUpperCase()}**`];
      for (const [sectionName, section] of Object.entries(result.sections)) {
        const sectionStatus = section.status.toUpperCase();
        if (section.issues.length === 0) {
          lines.push(`- ${sectionName}: ${sectionStatus}`);
        } else {
          const details = section.issues
            .map((issue) => `    • [${issue.level.toUpperCase()}] ${issue.message}${issue.guildId ? ` (Guild ${issue.guildId})` : ''}`)
            .join('\n');
          lines.push(`- ${sectionName}: ${sectionStatus}\n${details}`);
        }
      }
      await message.reply(lines.join('\n'));
    } catch (error) {
      client.logger.error('HealthCheck Command fehlgeschlagen', { error: error.message });
      await message.reply('HealthCheck konnte nicht ausgeführt werden.');
    }
  }
};
