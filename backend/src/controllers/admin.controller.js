const prisma = require("../config/prisma");

const getUsers = async (req, res) => {
  try {
    const users = await prisma.users.findMany({
      select: {
        users_id: true,
        display_name: true,
        email: true,
        is_active: true,
        last_login_at: true,
        created_at: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    // Map the database structure to the structure expected by the Settings RBAC UI
    const mappedUsers = users.map(user => ({
      id: user.users_id,
      name: user.display_name || "Unknown User",
      email: user.email,
      role: "Network Admin", // Role is static for now since there's no role field in DB
      lastActive: user.last_login_at ? user.last_login_at.toISOString() : user.created_at.toISOString(),
    }));

    return res.status(200).json({
      ok: true,
      data: mappedUsers,
    });
  } catch (error) {
    console.error("Error fetching admin users:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch admin users",
      error: error.message,
    });
  }
};

module.exports = {
  getUsers,
};
