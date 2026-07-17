const rateLimit = require('express-rate-limit');

const standardOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: true, message: 'Too many requests, please slow down' }
};

/** General API limiter. */
const apiLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  max: 600
});

/** Stricter limiter for register/login to slow brute-force attempts. */
const authLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  max: 30
});

module.exports = { apiLimiter, authLimiter };
