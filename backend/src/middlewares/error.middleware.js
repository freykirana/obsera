const notFoundHandler = (req, res) => {
  res.status(404).json({
    ok: false,
    message: "Route not found",
  });
};

const errorHandler = (err, req, res, next) => {
  console.error(err);

  res.status(err.status || 500).json({
    ok: false,
    message: err.message || "Internal server error",
  });
};

module.exports = { notFoundHandler, errorHandler };
