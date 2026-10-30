const env = {
  port: Number(process.env.PORT) || 4000,
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  jwtSecret: process.env.JWT_SECRET,
  // Shared secret the honeypot agent sends as "Authorization: Bearer <token>"
  ingestToken: process.env.INGEST_TOKEN,
};

if (!env.jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required');
}

if (!env.ingestToken) {
  console.warn("INGEST_TOKEN is not set: agent ingest and heartbeat requests will be rejected");
}

module.exports = { env };
