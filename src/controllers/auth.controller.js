const authService = require('../services/auth.service');

function register(req, res) {
  const { userName, phone, avatar } = req.body || {};
  const result = authService.register({ userName, phone, avatar });
  res.status(201).json(result);
}

function login(req, res) {
  const { phone } = req.body || {};
  const result = authService.login({ phone });
  res.json(result);
}

/** Session restore - returns the user behind the presented token. */
function me(req, res) {
  res.json({ user: authService.toPublicUser(req.user) });
}

module.exports = { register, login, me };
