# ChatApp Backend

Realtime chat backend: **Express REST API + Socket.IO**, JSON-file persistence, JWT sessions.

## Quick start

```bash
npm install
cp .env.example .env   # then edit values (JWT_SECRET, CORS_ORIGINS)
npm run dev            # nodemon
# or
npm start
```

Server default: `http://localhost:3000`. Data is stored under `./data/*.json` (git-ignored). Swap the `src/store` layer to move to a real database.

## Architecture

```
app.js                  entry shim (node app.js)
src/
  server.js             http + socket.io bootstrap, graceful shutdown
  app.js                express wiring (helmet, cors, rate limit, routes)
  config/               env-driven configuration
  routes/               /api route table
  controllers/          thin request handlers
  services/             business logic (auth, users, rooms, messages, presence)
  repositories/         data access (users, rooms, messages)
  store/                atomic JSON-file persistence
  middleware/           auth (JWT), rate limiters, error handler
  sockets/              socket-manager: all realtime events
  utils/                logger, validators, ApiError
scripts/socket-e2e.js   end-to-end test (npm run test:socket)
```

## REST API

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | – | `{userName, phone, avatar}` → `{user, token}` |
| POST | `/api/auth/login` | – | `{phone}` → `{user, token}` |
| GET | `/api/auth/me` | ✓ | session restore |
| GET | `/api/users` | ✓ | sidebar list: users + room, last message, unread, online |
| POST | `/api/rooms` | ✓ | `{userId}` → find-or-create DM room |
| GET | `/api/rooms/:roomId/messages` | ✓ | history, `?limit&before=<messageId>` |
| GET | `/api/health` | – | status + uptime |

Auth: `Authorization: Bearer <jwt>`.

## Socket.IO events

Handshake: `io(url, { auth: { token } })` — invalid tokens are rejected.

| Direction | Event | Payload |
| --- | --- | --- |
| C→S | `room:join` / `room:leave` | `{roomId}` (membership checked) |
| C→S | `message:send` (ack) | `{roomId, type: 'text'\|'image', content}` |
| C→S | `message:delivered` | `{roomId, messageId}` |
| C→S | `message:read` | `{roomId}` marks all incoming as read |
| C→S | `typing` | `{roomId, isTyping}` |
| S→C | `message:new` | full message (to recipient + sender's other tabs) |
| S→C | `message:status` | `{roomId, messageIds, status}` |
| S→C | `presence:list` / `presence:update` | presence snapshot / change |
| S→C | `typing` | `{roomId, userId, userName, isTyping}` |

Message statuses: `sent → delivered → read`. Messages sent while the recipient is offline are auto-marked delivered when they reconnect.

## Environment variables

See [.env.example](.env.example). In production set a strong `JWT_SECRET` and explicit `CORS_ORIGINS`.
