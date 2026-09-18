require("express-async-errors"); // must be required before routes are defined

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");

const env = require("./config/env");
const { uploadRoot } = require("./config/multer");
const errorHandler = require("./middleware/errorHandler");
const notFound = require("./middleware/notFound");
const apiV1Router = require("./routes/v1");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));

// Global rate limiter; auth routes apply a stricter limiter of their own.
app.use(
  rateLimit({
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Serve uploaded attachments. Files are only reachable by their random
// generated name (see config/multer.js), and the API additionally checks
// ticket-level authorization before ever handing out a file's URL.
app.use("/uploads", express.static(uploadRoot));

app.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/api/v1", apiV1Router);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
