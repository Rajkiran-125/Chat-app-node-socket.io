const { Router } = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rate-limiter');
const authController = require('../controllers/auth.controller');
const userController = require('../controllers/user.controller');
const roomController = require('../controllers/room.controller');
const presenceService = require('../services/presence.service');

const router = Router();

// Health
router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), online: presenceService.onlineCount() });
});

// Auth
router.post('/auth/register', authLimiter, asyncHandler(authController.register));
router.post('/auth/login', authLimiter, asyncHandler(authController.login));
router.get('/auth/me', requireAuth, asyncHandler(authController.me));

// Users (sidebar)
router.get('/users', requireAuth, asyncHandler(userController.list));

// Rooms + history
router.post('/rooms', requireAuth, asyncHandler(roomController.openDm));
router.get('/rooms/:roomId/messages', requireAuth, asyncHandler(roomController.history));

module.exports = router;
