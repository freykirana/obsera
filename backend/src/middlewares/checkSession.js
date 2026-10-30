const prisma = require("../config/prisma");

const checkSession = async (req, res, next) => {
  try {
    // Determine the user ID from the previous auth middleware
    const user_id = req.user?.user_id || req.user?.users_id;

    if (!user_id) {
      return res.status(401).json({ ok: false, message: "Unauthorized: No user found" });
    }

    // Bypass check if it's the development mock user and it doesn't exist in DB
    if (user_id === "dev-mock-id") {
      return next();
    }

    // 1. Fetch global settings for timeout
    let settings = await prisma.system_settings.findFirst();
    // Default to 30 minutes if settings table is empty
    const timeoutMinutes = settings ? settings.session_timeout_minutes : 30;

    // 2. Fetch user to check last_active
    const user = await prisma.users.findUnique({
      where: { user_id }
    });

    if (!user) {
      return res.status(401).json({ ok: false, message: "Unauthorized: Invalid user" });
    }

    // 3. Compare timestamps
    if (user.last_active) {
      const now = new Date();
      const lastActive = new Date(user.last_active);
      const diffMs = now.getTime() - lastActive.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins > timeoutMinutes) {
        return res.status(401).json({ ok: false, message: "Session expired due to inactivity." });
      }
    }

    // 4. Update last_active
    await prisma.users.update({
      where: { user_id },
      data: { last_active: new Date() }
    });

    // Attach full fresh user object to request
    req.user = user;
    
    return next();
  } catch (error) {
    console.error("Session check error:", error);
    return res.status(500).json({ ok: false, message: "Internal server error during session check" });
  }
};

module.exports = { checkSession };
