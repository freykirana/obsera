const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const { getLogs, updateStatus, getLogsAggregatedStats, getAttackerLogDetails, reviewLog, batchReviewLogs, markAttackerViewed, getIpSummary, getIpAttempts, exportIpAttempts } = require("../controllers/logs.controller");
const { getLogsSchema, updateStatusSchema, validateRequest } = require("../validations/logs.validation");
const { authRequired } = require("../middlewares/auth.middleware");
const { audit } = require("../services/audit.service");

// Rate limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  message: { ok: false, message: "Too many requests from this IP, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
});


// Protect all /api/logs routes with authentication (placeholder middleware applied)
router.use(authRequired);

// Per-IP detail page: summary, paginated attempts, export
router.get("/ip/:ip", apiLimiter, getIpSummary);
router.get("/ip/:ip/attempts", apiLimiter, getIpAttempts);
router.get("/ip/:ip/export", audit("logs.export", (req) => `${req.params.ip} (${req.query.format === "json" ? "json" : "csv"})`), exportIpAttempts);

// GET /api/logs/stats - Fetch aggregated stats using the same filter as getLogs
router.get("/stats", apiLimiter, validateRequest(getLogsSchema), getLogsAggregatedStats);

// PATCH /api/logs/batch-review - Batch review multiple raw logs
router.patch("/batch-review", audit("review.batch", (req) => `${req.body?.logIds?.length ?? 0} log(s)`), batchReviewLogs);

// PATCH /api/logs/:attacker_id/mark-viewed - Auto-review an attacker's logs once the admin opens its details
router.patch("/:attacker_id/mark-viewed", audit("review.auto_on_view", (req) => req.params.attacker_id), markAttackerViewed);

// PATCH /api/logs/:log_id/review - Mark a single raw log as reviewed
router.patch("/:log_id/review", audit("review.single", (req) => `${req.params.log_id} -> ${req.body?.status}`), reviewLog);

// GET /api/logs/:attacker_id/details - Fetch raw log details for a specific attacker
router.get("/:attacker_id/details", apiLimiter, getAttackerLogDetails);

// GET /api/logs - Fetch paginated and filtered logs
router.get("/", apiLimiter, validateRequest(getLogsSchema), getLogs);

// PUT /api/logs/update-status - Update status for single or multiple logs
router.put("/update-status", validateRequest(updateStatusSchema), audit("review.bulk_status", (req) => `${req.body.attackerIds.length} source(s) -> ${req.body.status}`), updateStatus);

module.exports = router;
