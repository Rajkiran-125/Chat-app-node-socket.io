const userService = require('../services/user.service');

async function list(req, res) {
  res.json({ users: await userService.sidebarList(req.user.id) });
}

module.exports = { list };
