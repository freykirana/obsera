const router = require("express").Router();
const { authRequired } = require("../middlewares/auth.middleware");
const { generateReport, getReports, downloadReport, deleteReport } = require("../controllers/reports.controller");
const { audit } = require("../services/audit.service");

// Get all generated reports
router.get("/", getReports);

// Generate a new report
router.post("/generate", audit("report.generate", (req) => req.body?.period || null), generateReport);

// Download a report (?format=pdf|csv|json, default pdf)
router.get("/:id/download", downloadReport);

// Delete a report
router.delete("/:id", audit("report.delete", (req) => req.params.id), deleteReport);

module.exports = router;
