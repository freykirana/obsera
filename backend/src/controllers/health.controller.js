const healthCheck = (req, res) => {
  res.status(200).json({
    ok: true,
    service: "honeypot-backend",
    timestamp: new Date().toISOString(),
  });
};

module.exports = { healthCheck };
