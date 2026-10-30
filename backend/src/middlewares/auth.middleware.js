const jwt = require("jsonwebtoken");
const { env } = require("../config/env");

async function authRequired(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, message: "Missing or invalid authorization token" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ ok: false, message: "No token provided" });
    }

    // Verify token
    const decoded = jwt.verify(token, env.jwtSecret);
    
    // Perform dynamic iat (Issued At) check against current DB settings
    const prisma = require("../config/prisma");
    const settings = await prisma.system_settings.findFirst();
    const timeoutMinutes = settings ? settings.session_timeout_minutes : 30;
    
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const tokenAgeMinutes = (nowInSeconds - decoded.iat) / 60;
    
    if (tokenAgeMinutes > timeoutMinutes) {
      return res.status(401).json({ ok: false, message: "Token expired due to inactivity (dynamic policy)" });
    }

    // Tokens of deleted accounts, or issued before the last password change, are no longer valid
    const account = await prisma.users.findUnique({
      where: { user_id: decoded.user_id },
      select: { password_changed_at: true },
    });
    if (!account) {
      return res.status(401).json({ ok: false, message: "Invalid token" });
    }
    if (account.password_changed_at && decoded.iat < Math.floor(account.password_changed_at.getTime() / 1000)) {
      return res.status(401).json({ ok: false, message: "Session ended because the password was changed" });
    }

    // Attach decoded token payload to req.user (typically contains user_id)
    req.user = decoded;
    
    return next();
  } catch (error) {
    console.error("JWT Verification Error:", error.message);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ ok: false, message: "Token expired" });
    }
    return res.status(401).json({ ok: false, message: "Invalid token" });
  }
}

module.exports = { authRequired };
