require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const routes = require("./routes");
const { notFoundHandler, errorHandler } = require("./middlewares/error.middleware");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(morgan("dev"));
app.use(express.json());

// Normalize double slashes in URLs
app.use((req, res, next) => {
  req.url = req.url.replace(/\/\/+/g, '/');
  next();
});

app.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    message: "Backend is running",
    docs: "/api/health",
  });
});

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
