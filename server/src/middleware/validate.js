const { validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

// Runs after an express-validator chain array; collects all failures into
// one 400 response instead of letting bad input reach a controller.
function validate(req, _res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ApiError(400, "Validation failed", errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
    })));
  }
  next();
}

module.exports = validate;
