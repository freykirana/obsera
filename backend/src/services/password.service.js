const prisma = require("../config/prisma");
const { hashPassword } = require("../utils/password");

const MIN_PASSWORD_LENGTH = 12;

/**
 * Store a new password and stamp password_changed_at, which makes authRequired
 * reject every token issued before now (other sessions are signed out).
 */
async function setUserPassword(userId, newPassword) {
  const changedAt = new Date();
  await prisma.users.update({
    where: { user_id: userId },
    data: { password_hash: await hashPassword(newPassword), password_changed_at: changedAt },
  });
  return changedAt;
}

module.exports = { MIN_PASSWORD_LENGTH, setUserPassword };
