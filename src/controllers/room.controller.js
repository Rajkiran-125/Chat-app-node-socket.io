const roomService = require('../services/room.service');
const messageService = require('../services/message.service');

function openDm(req, res) {
  const { userId } = req.body || {};
  const room = roomService.openDm(req.user.id, userId);
  res.json({ room });
}

function history(req, res) {
  const { before, limit } = req.query;
  const page = messageService.history(req.params.roomId, req.user.id, { before, limit });
  res.json(page);
}

module.exports = { openDm, history };
