const prisma = require("../config/prisma");

const profileSelect = {
  user_id: true,
  display_name: true,
  email: true,
  is_active: true,
  created_at: true,
};

// Password changes go through POST /api/auth/change-password (length rules, rate limit, session sign-out)
async function updateProfile(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const { displayName } = req.body || {};

    // Update display name
    if (displayName && displayName.trim()) {
      if (displayName.trim().length < 3) {
        return res.status(400).json({ ok: false, message: "Nama minimal 3 karakter" });
      }

      await prisma.users.update({
        where: { user_id: user.user_id },
        data: { display_name: displayName.trim() },
      });
    }

    // Return updated user
    const updatedUser = await prisma.users.findUnique({
      where: { user_id: user.user_id },
      select: profileSelect,
    });

    return res.status(200).json({
      ok: true,
      message: "Profile updated",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
}

async function getProfile(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const dbUser = await prisma.users.findUnique({
      where: { user_id: user.user_id },
      select: profileSelect,
    });

    if (!dbUser) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    return res.status(200).json({
      ok: true,
      user: dbUser,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
}

module.exports = { updateProfile, getProfile };
