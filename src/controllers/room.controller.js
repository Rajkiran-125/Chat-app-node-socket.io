const roomService = require('../services/room.service');
const messageService = require('../services/message.service');

async function openDm(req, res) {
  const { userId } = req.body || {};
  const room = await roomService.openDm(req.user.id, userId);
  res.json({ room });
}

async function history(req, res) {
  const { before, limit } = req.query;
  const page = await messageService.history(req.params.roomId, req.user.id, { before, limit });
  res.json(page);
}

module.exports = { openDm, history };
