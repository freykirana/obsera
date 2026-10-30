const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const { authRequired } = require("../middlewares/auth.middleware");
const { login, getMe, changePassword, logout } = require("../controllers/auth.controller");
const { audit } = require("../services/audit.service");

// Failed password changes per account; successful ones do not count
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.user.user_id,
  message: { ok: false, message: "Too many attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// The token does not exist yet during login, so the actor is the submitted email
const loginActor = (req, res, next) => {
  req.auditActorEmail = typeof req.body?.email === "string" ? req.body.email.slice(0, 255) : null;
  next();
};

router.post("/login", loginActor, audit("auth.login"), login);
router.get("/me", authRequired, getMe);
router.post("/change-password", authRequired, changePasswordLimiter, audit("auth.change_password"), changePassword);
router.post("/logout", authRequired, audit("auth.logout"), logout);

module.exports = router;
