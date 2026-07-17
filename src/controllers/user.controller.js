const userService = require('../services/user.service');

function list(req, res) {
  res.json({ users: userService.sidebarList(req.user.id) });
}

module.exports = { list };
