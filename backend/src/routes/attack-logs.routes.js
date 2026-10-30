const router = require("express").Router();
const { logAttack, getAttackLogs, getAttackStats, getAttackTimeline, getAttackHourly, getLastAttack, getAttackTopSources, getAttackHeatmap } = require("../controllers/attack-logs.controller");
const { authRequired } = require("../middlewares/auth.middleware");
const { ingestTokenRequired } = require("../middlewares/ingest.middleware");

// Ingest from the honeypot agent, authenticated with INGEST_TOKEN
router.post("/", ingestTokenRequired, logAttack);

// Everything below is read by the dashboard and requires a signed-in user
router.use(authRequired);

// Get all attack logs
router.get("/", getAttackLogs);

// Get attack statistics
router.get("/stats", getAttackStats);

// Get zero-filled attack timeline (range: 1h, 24h, 7d, 30d, custom + from/to; tz)
router.get("/timeline", getAttackTimeline);

// Get zero-filled attack distribution by hour of day (range: 1h, 24h, 7d, 30d, custom + from/to; tz)
router.get("/hourly", getAttackHourly);

// Time of the most recent attack (empty states)
router.get("/last-attack", getLastAttack);

// Most active attacking sources (range, from/to, tz, limit)
router.get("/top-sources", getAttackTopSources);

// Day of week x hour of day attack volume (range, from/to, tz)
router.get("/heatmap", getAttackHeatmap);

module.exports = router;
