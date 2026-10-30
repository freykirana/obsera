const prisma = require("../config/prisma");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { env } = require("../config/env");
const { MIN_PASSWORD_LENGTH, setUserPassword } = require("../services/password.service");

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string(),
});

// Session token; its lifetime follows the session timeout in system settings
const issueToken = async (userId) => {
  const settings = await prisma.system_settings.findFirst();
  const timeoutMinutes = settings ? settings.session_timeout_minutes : 30;
  return jwt.sign({ user_id: userId }, env.jwtSecret, { expiresIn: `${timeoutMinutes}m` });
};

/**
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body);

    const user = await prisma.users.findUnique({
      where: { email: validatedData.email }
    });

    if (!user) {
      return res.status(401).json({ ok: false, message: "Invalid email or password" });
    }

    if (!user.is_active) {
      return res.status(403).json({ ok: false, message: "Account is disabled" });
    }

    const isValidPassword = await bcrypt.compare(validatedData.password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ ok: false, message: "Invalid email or password" });
    }

    const token = await issueToken(user.user_id);

    // Update last_login_at
    await prisma.users.update({
      where: { user_id: user.user_id },
      data: { last_login_at: new Date(), last_active: new Date() }
    });

    return res.status(200).json({
      ok: true,
      message: "Login successful",
      data: { token }
    });
  } catch (error) {
    console.error("Login error:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ ok: false, message: "Validation error", errors: error.errors });
    }
    return res.status(500).json({ ok: false, message: "Internal server error during login" });
  }
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  try {
    // req.user is populated by auth.middleware.js
    const user_id = req.user.user_id || req.user.users_id;

    const user = await prisma.users.findUnique({
      where: { user_id },
      select: {
        user_id: true,
        display_name: true,
        email: true,
        is_active: true,
        last_login_at: true,
        last_active: true,
      }
    });

    if (!user) {
      return res.status(404).json({ ok: false, message: "User profile not found" });
    }

    return res.status(200).json({
      ok: true,
      data: {
        ...user,
        role: "Admin" // TODO: read from a users.role column once roles are persisted
      }
    });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
};

/**
 * POST /api/auth/change-password
 * Signs out the account's other sessions and returns a fresh token for this one.
 * Wrong current password is a 400 (not 401) so the client does not treat it as an expired session.
 */
const changePassword = async (req, res) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Enter your current and new password." });
    }
    const { currentPassword, newPassword } = parsed.data;

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ ok: false, message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }

    const user = await prisma.users.findUnique({
      where: { user_id: req.user.user_id },
      select: { user_id: true, password_hash: true },
    });
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(400).json({ ok: false, message: "Current password is incorrect." });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({ ok: false, message: "New password must be different from the current one." });
    }

    await setUserPassword(user.user_id, newPassword);
    const token = await issueToken(user.user_id);

    return res.status(200).json({ ok: true, message: "Password changed", data: { token } });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ ok: false, message: "Could not change the password. Please try again." });
  }
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  // With stateless JWTs stored in localStorage, logout is mostly handled client-side.
  // We provide this endpoint for completeness or future token blacklisting/cookie clearing.
  return res.status(200).json({
    ok: true,
    message: "Logged out successfully"
  });
};

module.exports = {
  login,
  getMe,
  changePassword,
  logout
};
