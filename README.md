# ChatApp Backend

Realtime chat backend: **Express REST API + Socket.IO**, MongoDB persistence, JWT sessions.

## Quick start

```bash
npm install
cp .env.example .env   # then edit values (JWT_SECRET, CORS_ORIGINS, MONGODB_URI)
npm run dev            # nodemon
# or
npm start
```

Server default: `http://localhost:3000`. Data is stored in MongoDB (`MONGODB_URI`), so it
survives restarts and redeploys on ephemeral hosts like Render. A MongoDB Atlas free (M0)
cluster works out of the box.

### Migrating legacy JSON data

Older deployments stored data under `./data/*.json`. To import it into MongoDB once:

```bash
MONGODB_URI="mongodb+srv://..." npm run migrate
```

The migration is idempotent (upserts by `id`), so it's safe to re-run.

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
  store/                mongo-store: connection pool + collection helpers
  middleware/           auth (JWT), rate limiters, error handler
  sockets/              socket-manager: all realtime events
  utils/                logger, validators, ApiError
scripts/socket-e2e.js   end-to-end test (npm run test:socket)
scripts/migrate-json-to-mongo.js  one-time JSON → MongoDB import (npm run migrate)
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

See [.env.example](.env.example). In production set a strong `JWT_SECRET`, explicit
`CORS_ORIGINS`, and a `MONGODB_URI`.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `JWT_SECRET` | prod | dev fallback | App refuses to boot in production without it |
| `MONGODB_URI` | ✓ | – | e.g. `mongodb+srv://user:pass@cluster/...` |
| `MONGODB_DB` | – | `chatapp` | Database name within the cluster |
| `CORS_ORIGINS` | prod | localhost + firebase | Comma-separated origins, or `*` |
| `NODE_ENV` | prod | `development` | Set to `production` on Render |
| `PORT` | – | `3000` | Render sets this automatically |
| `JWT_EXPIRES_IN` | – | `7d` | Token lifetime |
| `KEEP_ALIVE_URL` | – | – | Self-ping URL for free-tier sleep prevention |
| `LOG_LEVEL` | – | `info` | `debug` / `info` / `warn` / `error` |
