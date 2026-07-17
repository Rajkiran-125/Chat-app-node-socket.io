const ApiError = require('../utils/api-error');
const authService = require('../services/auth.service');

/** Requires a valid `Authorization: Bearer <jwt>` header; sets req.user. */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = token ? await authService.resolveToken(token) : null;
  if (!user) {
    return next(ApiError.unauthorized('Invalid or expired session, please log in again'));
  }
  req.user = user;
  return next();
}

module.exports = { requireAuth };
