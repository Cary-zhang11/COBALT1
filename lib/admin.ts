const ADMIN_USERS = (process.env.ADMIN_USERS || "").split(",").filter(Boolean);

export function isAdmin(user: {
  username?: string | null;
  permissions?: any;
}): boolean {
  if (user.username && ADMIN_USERS.includes(user.username)) return true;
  if (user.permissions?.is_admin) return true;
  return false;
}
