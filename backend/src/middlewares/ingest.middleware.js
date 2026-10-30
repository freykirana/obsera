const crypto = require("crypto");
const { env } = require("../config/env");

// Hash both sides so timingSafeEqual always compares equal-length buffers
const digest = (value) => crypto.createHash("sha256").update(String(value)).digest();

/**
 * Guards agent endpoints (log ingest, heartbeat) with the shared INGEST_TOKEN.
 * Fails closed: without a configured token every agent request is rejected.
 */
function ingestTokenRequired(req, res, next) {
  if (!env.ingestToken) {
    return res.status(503).json({ ok: false, message: "Ingest is disabled: INGEST_TOKEN is not configured" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token || !crypto.timingSafeEqual(digest(token), digest(env.ingestToken))) {
    return res.status(401).json({ ok: false, message: "Missing or invalid ingest token" });
  }

  return next();
}

module.exports = { ingestTokenRequired };
