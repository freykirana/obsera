const prisma = require("../config/prisma");
const bcrypt = require("bcryptjs");
const { z } = require("zod");

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

/**
 * GET /api/users
 * Fetch all admins from users table
 */
const getUsers = async (req, res) => {
  try {
    const users = await prisma.users.findMany({
      select: {
        user_id: true,
        display_name: true,
        email: true,
        is_active: true,
        last_active: true,
      },
      orderBy: { created_at: 'desc' }
    });

    // TODO: add a `role` column (Admin / Analyst / Viewer) to the users table and enforce it
    // in middleware. Every existing account is an administrator, so report that for now.
    return res.status(200).json({ ok: true, data: users.map((user) => ({ ...user, role: "Admin" })) });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({ ok: false, message: "Failed to fetch users" });
  }
};

/**
 * POST /api/users
 * Create a new user (hash password with bcrypt, key: user_id)
 */
const createUser = async (req, res) => {
  try {
    const validatedData = createUserSchema.parse(req.body);

    // Check if email already exists
    const existingUser = await prisma.users.findUnique({
      where: { email: validatedData.email }
    });

    if (existingUser) {
      return res.status(400).json({ ok: false, message: "Email already in use" });
    }

    const password_hash = await bcrypt.hash(validatedData.password, 10);

    const newUser = await prisma.users.create({
      data: {
        display_name: validatedData.name,
        email: validatedData.email,
        password_hash: password_hash,
        is_active: true,
        last_active: new Date(),
      }
    });

    return res.status(201).json({ 
      ok: true, 
      message: "User created successfully", 
      data: {
        user_id: newUser.user_id,
        display_name: newUser.display_name,
        email: newUser.email,
      } 
    });
  } catch (error) {
    console.error("Error creating user:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: "Validation error", errors: error.errors });
    }
    return res.status(500).json({ ok: false, message: "Failed to create user" });
  }
};

/**
 * DELETE /api/users/:user_id
 * Delete a user. Prevent an admin from deleting their own account.
 */
const deleteUser = async (req, res) => {
  try {
    const { user_id } = req.params;
    const current_user_id = req.user?.user_id || req.user?.users_id; // Handle mock users_id fallback if needed

    if (user_id === current_user_id) {
      return res.status(403).json({ ok: false, message: "Action denied: You cannot delete your own account." });
    }

    const user = await prisma.users.findUnique({ where: { user_id } });
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    await prisma.users.delete({ where: { user_id } });

    return res.status(200).json({ ok: true, message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ ok: false, message: "Failed to delete user" });
  }
};

module.exports = {
  getUsers,
  createUser,
  deleteUser
};
