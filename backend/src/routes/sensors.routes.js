const router = require("express").Router();
const { authRequired } = require("../middlewares/auth.middleware");
const { ingestTokenRequired } = require("../middlewares/ingest.middleware");
const { touchSensor, getSensorStatus } = require("../services/sensor.service");

// Heartbeat from the honeypot agent, authenticated with INGEST_TOKEN like POST /api/attack-logs
router.post("/heartbeat", ingestTokenRequired, (req, res) => {
  const { sensor_id, hostname, version } = req.body || {};
  touchSensor(sensor_id, { hostname, version });
  return res.status(200).json({ ok: true });
});

// Aggregated monitoring status for the header badge
router.get("/status", authRequired, async (req, res) => {
  try {
    return res.status(200).json({ ok: true, data: await getSensorStatus() });
  } catch (error) {
    console.error("Error reading sensor status:", error);
    return res.status(500).json({ ok: false, message: "Failed to read sensor status" });
  }
});

module.exports = router;
