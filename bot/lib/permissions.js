function isOwner(userId, globalConfig) {
  return Boolean(globalConfig?.bot?.owners?.includes(userId));
}

function isGuildAdmin(member, guildConfig) {
  if (!member) return false;
  if (member.permissions?.has?.('Administrator')) return true;
  const roles = guildConfig?.roles?.admins || guildConfig?.adminRoles || [];
  return member.roles?.cache?.some((role) => roles.includes(role.id));
}

function hasModRole(member, guildConfig) {
  if (!member) return false;
  if (isGuildAdmin(member, guildConfig)) return true;
  const roles = guildConfig?.roles?.moderators || guildConfig?.modRoles || [];
  return member.roles?.cache?.some((role) => roles.includes(role.id));
}

function canUseCommand(message, command, globalConfig, guildConfig) {
  if (!command) return false;
  if (command.allowDM && message.channel?.isDMBased?.()) return true;
  if (isOwner(message.author.id, globalConfig)) return true;
  if (command.requiredPermissions?.includes?.('OWNER')) {
    return isOwner(message.author.id, globalConfig);
  }
  if (command.requiredPermissions?.includes?.('ADMIN')) {
    return isGuildAdmin(message.member, guildConfig);
  }
  if (command.requiredPermissions?.includes?.('MOD')) {
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
