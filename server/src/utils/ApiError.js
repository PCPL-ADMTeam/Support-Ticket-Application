// Thrown anywhere in the request lifecycle; caught by the centralized error
// handler middleware and turned into a consistent JSON error response.
class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
