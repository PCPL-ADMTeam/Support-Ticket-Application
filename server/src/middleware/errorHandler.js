const { Prisma } = require("@prisma/client");
const ApiError = require("../utils/ApiError");

// Centralized error handler — must be registered LAST in app.js.
// express-async-errors forwards rejected promises from async route
// handlers here automatically, so controllers/services just `throw`.
function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details,
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: `A record with this ${err.meta?.target?.join(", ") || "value"} already exists`,
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ success: false, message: "Record not found" });
    }
  }

  if (err.name === "MulterError") {
    return res.status(400).json({ success: false, message: err.message });
  }

  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  return res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
}

module.exports = errorHandler;
