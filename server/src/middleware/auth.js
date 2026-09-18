const ApiError = require("../utils/ApiError");
const { verifyAccessToken } = require("../utils/jwt");
const prisma = require("../config/prisma");

// Verifies the JWT access token and attaches the authenticated user (with
// role) to req.user. Every protected route depends on this running first —
// authorization checks downstream NEVER trust anything the client sends
// about its own role, only what's loaded from the DB here.
async function authenticate(req, _res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new ApiError(401, "Authentication required");
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    throw new ApiError(401, "Invalid or expired access token");
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { role: true, teamMemberships: { select: { teamId: true } } },
  });

  if (!user || !user.isActive) {
    throw new ApiError(401, "Account not found or deactivated");
  }

  req.user = user;
  next();
}

module.exports = authenticate;
