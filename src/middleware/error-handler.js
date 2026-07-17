const logger = require('../utils/logger');
const ApiError = require('../utils/api-error');

/** Wrap async route handlers so rejections reach the error handler. */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.path}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.statusCode || 500;
  if (status >= 500) {
    logger.error('Unhandled error:', err.stack || err.message);
  }
  res.status(status).json({
    error: true,
    message: status >= 500 ? 'Internal server error' : err.message
  });
}

module.exports = { asyncHandler, notFoundHandler, errorHandler };
