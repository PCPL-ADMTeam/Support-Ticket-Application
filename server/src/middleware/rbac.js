const ApiError = require("../utils/ApiError");

// Route-level role gate. Usage: router.get("/", authenticate, requireRole("ADMIN"), ...)
// Always used ALONGSIDE (not instead of) row-level checks in the service
// layer (e.g. an Agent may only touch tickets assigned to them/their team).
function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      throw new ApiError(401, "Authentication required");
    }
    if (!allowedRoles.includes(req.user.role.name)) {
      throw new ApiError(403, "You do not have permission to perform this action");
    }
    next();
  };
}

module.exports = requireRole;
