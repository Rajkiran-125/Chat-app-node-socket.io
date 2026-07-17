const { Server } = require('socket.io');
const config = require('../config');
const logger = require('../utils/logger');
const authService = require('../services/auth.service');
const presenceService = require('../services/presence.service');
const roomService = require('../services/room.service');
const messageService = require('../services/message.service');
const roomRepository = require('../repositories/room.repository');
const messageRepository = require('../repositories/message.repository');
const userRepository = require('../repositories/user.repository');
const { createSocketRateLimiter } = require('./socket-rate-limiter');

/**
 * Realtime layer.
 *
 * Every socket joins a personal room `user:<id>` on connect, so events reach
 * a user on all their tabs/devices even when the chat room is not open
 * (sidebar previews, unread badges). Events:
 *
 *   client -> server                      server -> client
 *   ------------------------------------  --------------------------------------
 *   message:send {roomId,type,content}    message:new    (full message)
 *   message:delivered {roomId,messageId}  message:status {roomId,messageIds,status}
 *   message:read {roomId}                 presence:list  [{userId,online,lastSeenAt}]
 *   typing {roomId,isTyping}              presence:update {userId,online,lastSeenAt}
 *   room:join / room:leave {roomId}       typing {roomId,userId,userName,isTyping}
 */
function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigins,
      methods: ['GET', 'POST']
    },
    maxHttpBufferSize: 1.2e6
  });

  // Handshake auth: socket.handshake.auth.token must be a valid JWT.
  io.use((socket, next) => {
    const user = authService.resolveToken(socket.handshake.auth?.token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    return next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const limiter = createSocketRateLimiter();
    logger.info(`socket connected: ${socket.id} (${user.userName})`);

    socket.join(`user:${user.id}`);

    // Presence: announce only on the first socket of this user.
    const cameOnline = presenceService.addSocket(user.id, socket.id);
    if (cameOnline) {
      socket.broadcast.emit('presence:update', {
        userId: user.id,
        online: true,
        lastSeenAt: null
      });
      deliverPendingMessages(io, user.id);
    }

    // Give the connecting client the current presence snapshot.
    socket.emit('presence:list', buildPresenceList(user.id));

    socket.on('room:join', (payload, ack) => {
      safe(ack, () => {
        const roomId = requireRoomId(payload);
        roomService.assertMembership(roomId, user.id);
        socket.join(roomId);
        return { ok: true };
      });
    });

    socket.on('room:leave', (payload) => {
      const roomId = payload && payload.roomId;
      if (typeof roomId === 'string') socket.leave(roomId);
    });

    socket.on('message:send', (payload, ack) => {
      safe(ack, () => {
        if (!limiter.allow('message', 20)) {
          throw badRequest('You are sending messages too quickly');
        }
        const roomId = requireRoomId(payload);
        const { message, recipientId } = messageService.createMessage({
          roomId,
          sender: user,
          type: payload.type,
          content: payload.content,
          clientId: typeof payload.clientId === 'string' ? payload.clientId : null
        });
        // Recipient (all their devices) + the sender's other tabs.
        io.to(`user:${recipientId}`).emit('message:new', message);
        socket.to(`user:${user.id}`).emit('message:new', message);
        return { ok: true, message };
      });
    });

    socket.on('message:delivered', (payload) => {
      try {
        if (!limiter.allow('status', 60)) return;
        const roomId = requireRoomId(payload);
        roomService.assertMembership(roomId, user.id);
        if (typeof payload.messageId !== 'string') return;
        const senderId = messageRepository.markMessageDelivered(roomId, payload.messageId, user.id);
        if (senderId) {
          io.to(`user:${senderId}`).emit('message:status', {
            roomId,
            messageIds: [payload.messageId],
            status: 'delivered'
          });
        }
      } catch (err) {
        logger.debug('message:delivered ignored:', err.message);
      }
    });

    socket.on('message:read', (payload) => {
      try {
        if (!limiter.allow('status', 60)) return;
        const roomId = requireRoomId(payload);
        const room = roomService.assertMembership(roomId, user.id);
        const messageIds = messageRepository.markReadForRecipient(roomId, user.id);
        if (messageIds.length) {
          const senderId = roomService.otherMemberId(room, user.id);
          io.to(`user:${senderId}`).emit('message:status', {
            roomId,
            messageIds,
            status: 'read'
          });
          // Keep the reader's OWN other tabs/devices in sync (clear unread there too).
          socket.to(`user:${user.id}`).emit('room:read', { roomId });
        }
      } catch (err) {
        logger.debug('message:read ignored:', err.message);
      }
    });

    socket.on('typing', (payload) => {
      try {
        if (!limiter.allow('typing', 30)) return;
        const roomId = requireRoomId(payload);
        const room = roomService.assertMembership(roomId, user.id);
        const otherId = roomService.otherMemberId(room, user.id);
        io.to(`user:${otherId}`).emit('typing', {
          roomId,
          userId: user.id,
          userName: user.userName,
          isTyping: payload.isTyping === true
        });
      } catch (err) {
        logger.debug('typing ignored:', err.message);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`socket disconnected: ${socket.id} (${user.userName})`);
      const wentOffline = presenceService.removeSocket(user.id, socket.id);
      if (wentOffline) {
        socket.broadcast.emit('presence:update', {
          userId: user.id,
          online: false,
          lastSeenAt: new Date().toISOString()
        });
      }
    });
  });

  return io;
}

/** All messages that were waiting for this user become 'delivered'; tell the senders. */
function deliverPendingMessages(io, userId) {
  roomRepository.listForUser(userId).forEach((room) => {
    const messageIds = messageRepository.markDeliveredForRecipient(room.id, userId);
    if (messageIds.length) {
      const senderId = room.memberIds.find((id) => id !== userId);
      io.to(`user:${senderId}`).emit('message:status', {
        roomId: room.id,
        messageIds,
        status: 'delivered'
      });
    }
  });
}

function buildPresenceList(exceptUserId) {
  return userRepository
    .all()
    .filter((u) => u.id !== exceptUserId)
    .map((u) => ({
      userId: u.id,
      online: presenceService.isOnline(u.id),
      lastSeenAt: u.lastSeenAt
    }));
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function requireRoomId(payload) {
  if (!payload || typeof payload.roomId !== 'string' || !payload.roomId) {
    throw badRequest('roomId is required');
  }
  return payload.roomId;
}

/** Run a handler, routing thrown errors into the ack instead of crashing. */
function safe(ack, fn) {
  try {
    const result = fn();
    if (typeof ack === 'function') ack(result);
  } catch (err) {
    logger.warn('socket event rejected:', err.message);
    if (typeof ack === 'function') ack({ ok: false, message: err.message });
  }
}

module.exports = { createSocketServer };
