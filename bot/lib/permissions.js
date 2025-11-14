function isOwner(userId, config) {
  return Boolean(config?.bot?.owners?.includes(userId));
}

function isGuildAdmin(member, guildConfig) {
  if (!member) return false;
  if (member.permissions?.has?.('Administrator')) return true;
  const roles = guildConfig?.adminRoles || [];
  return member.roles?.cache?.some((role) => roles.includes(role.id));
}

function hasModRole(member, guildConfig) {
  if (!member) return false;
  if (isGuildAdmin(member, guildConfig)) return true;
  const roles = guildConfig?.modRoles || [];
  return member.roles?.cache?.some((role) => roles.includes(role.id));
}

function canUseCommand(message, command, config, guildConfig) {
  if (!command) return false;
  if (command.allowDM && message.channel?.isDMBased?.()) return true;
  if (isOwner(message.author.id, config)) return true;
  if (command.requiredPermissions?.includes('ADMIN')) {
    return isGuildAdmin(message.member, guildConfig);
  }
  if (command.requiredPermissions?.includes('MOD')) {
    return hasModRole(message.member, guildConfig);
  }
  if (Array.isArray(command.discordPermissions) && command.discordPermissions.length > 0) {
    return command.discordPermissions.every((perm) => message.member?.permissions?.has?.(perm));
  }
  return true;
}

module.exports = {
  isOwner,
  isGuildAdmin,
  hasModRole,
  canUseCommand
};
