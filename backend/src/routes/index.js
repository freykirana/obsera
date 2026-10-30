const router = require("express").Router();

const authRoutes = require("./auth.routes");
const profileRoutes = require("./profile.routes");
const healthRoutes = require("./health.routes");
const attackLogsRoutes = require("./attack-logs.routes");
const reportsRoutes = require("./reports.routes");
const adminRoutes = require("./admin.routes");
const settingsRoutes = require("./settings.routes");
const usersRoutes = require("./users.routes");
const sensorsRoutes = require("./sensors.routes");
const auditRoutes = require("./audit.routes");

const { authRequired } = require("../middlewares/auth.middleware");

// Keep auth routes mostly unprotected (except for specific endpoints handled internally)
router.use("/auth", authRoutes);

// POST is the agent ingest (INGEST_TOKEN); the GET endpoints need a signed-in user.
// Both checks live in attack-logs.routes.js.
router.use("/attack-logs", attackLogsRoutes);

// Protect all dashboard UI routes
router.use("/users/profile", authRequired, profileRoutes);
router.use("/admin", authRequired, adminRoutes);

const logsRoutes = require("./logs.routes");
// The UI uses /api/logs for GET, PUT, etc.
router.use("/logs", authRequired, logsRoutes);

router.use("/reports", authRequired, reportsRoutes);
router.use("/settings", authRequired, settingsRoutes);
router.use("/users", authRequired, usersRoutes);

// Sensor heartbeats (agent) and monitoring status (UI); auth is handled per route
router.use("/sensors", sensorsRoutes);
router.use("/audit-log", auditRoutes);

router.use(healthRoutes);

module.exports = router;
