const router = require("express").Router();
const { getSettings, updateSettings } = require("../controllers/settings.controller");
const { authRequired } = require("../middlewares/auth.middleware");
const { checkSession } = require("../middlewares/checkSession");
const { audit } = require("../services/audit.service");

const describeSettingsChange = (req) =>
  Object.entries(req.body || {})
    .filter(([key]) => ["session_timeout_minutes", "timezone"].includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ") || null;

// Protect all settings routes
router.use(authRequired);
router.use(checkSession);

router.get("/", getSettings);
router.patch("/", audit("settings.update", describeSettingsChange), updateSettings);

module.exports = router;
