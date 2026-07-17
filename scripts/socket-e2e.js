/**
 * End-to-end verification: registers/logs in two users over REST, connects two
 * Socket.IO clients, then exercises rooms, messaging, delivery/read receipts,
 * typing and presence. Exits 0 when every step passes.
 *
 * Usage: node scripts/socket-e2e.js [baseUrl]   (default http://localhost:3000)
 */
const { io } = require('socket.io-client');

const BASE = process.argv[2] || 'http://localhost:3000';
const results = [];

function check(name, condition) {
  results.push({ name, pass: !!condition });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
}

async function api(path, options = {}, token) {
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function ensureUser(userName, phone) {
  const reg = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ userName, phone, avatar: 'https://example.com/a.png' })
  });
  if (reg.status === 201) return reg.body;
  const log = await api('/auth/login', { method: 'POST', body: JSON.stringify({ phone }) });
  if (log.status !== 200) throw new Error(`login failed for ${phone}: ${JSON.stringify(log.body)}`);
  return log.body;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket', 'polling'] });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('socket connect timeout')), 8000);
  });
}

function waitFor(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

async function main() {
  const suffix = `${Date.now()}`.slice(-6);
  console.log(`Testing against ${BASE}\n`);

  // --- REST ---
  const health = await api('/health');
  check('GET /api/health returns ok', health.status === 200 && health.body.status === 'ok');

  const alice = await ensureUser('Alice Test', `901${suffix}`);
  const bob = await ensureUser('Bob Test', `902${suffix}`);
  check('register/login returns token + user', !!(alice.token && alice.user.id && bob.token));

  const badLogin = await api('/auth/login', { method: 'POST', body: JSON.stringify({ phone: '00000001' }) });
  check('login with unknown phone -> 404', badLogin.status === 404);

  const noAuth = await api('/users');
  check('GET /users without token -> 401', noAuth.status === 401);

  const me = await api('/auth/me', {}, alice.token);
  check('GET /auth/me restores session', me.status === 200 && me.body.user.id === alice.user.id);

  const users = await api('/users', {}, alice.token);
  check('GET /users lists other users (not self)',
    users.status === 200 &&
    users.body.users.some((u) => u.id === bob.user.id) &&
    !users.body.users.some((u) => u.id === alice.user.id));

  const roomRes = await api('/rooms', { method: 'POST', body: JSON.stringify({ userId: bob.user.id }) }, alice.token);
  const room = roomRes.body?.room;
  check('POST /rooms creates DM room', roomRes.status === 200 && !!room?.id);

  const roomAgain = await api('/rooms', { method: 'POST', body: JSON.stringify({ userId: alice.user.id }) }, bob.token);
  check('room is deterministic (no duplicates)', roomAgain.body?.room?.id === room.id);

  // --- Socket auth ---
  let rejected = false;
  try {
    await connect('not-a-valid-token');
  } catch {
    rejected = true;
  }
  check('socket with bad token is rejected', rejected);

  // --- Offline delivery: Alice sends while Bob is offline ---
  const aliceSocket = await connect(alice.token);
  const offlineSend = await emitAck(aliceSocket, 'message:send', {
    roomId: room.id, type: 'text', content: 'sent while you were away'
  });
  check('message to offline user has status "sent"',
    offlineSend.ok && offlineSend.message.status === 'sent');

  // --- Bob comes online: pending message becomes delivered, presence fires ---
  const presencePromise = waitFor(aliceSocket, 'presence:update');
  const statusPromise = waitFor(aliceSocket, 'message:status');
  const bobSocket = await connect(bob.token);

  const presence = await presencePromise;
  check('presence:update fires when Bob connects', presence.userId === bob.user.id && presence.online === true);

  const delivered = await statusPromise;
  check('pending message auto-delivered on connect',
    delivered.status === 'delivered' && delivered.messageIds.includes(offlineSend.message.id));

  // --- Live messaging ---
  const joinAck = await emitAck(bobSocket, 'room:join', { roomId: room.id });
  check('room:join acks ok for member', joinAck.ok === true);

  const badJoin = await emitAck(bobSocket, 'room:join', { roomId: 'dm_x_y' });
  check('room:join rejected for non-member room', badJoin.ok === false);

  const bobReceives = waitFor(bobSocket, 'message:new');
  const liveSend = await emitAck(aliceSocket, 'message:send', {
    roomId: room.id, type: 'text', content: 'hello bob!'
  });
  const received = await bobReceives;
  check('live message delivered in real time',
    liveSend.ok && received.id === liveSend.message.id && received.content === 'hello bob!');
  check('message is created with status "sent"', liveSend.message.status === 'sent');

  // Recipient's client acknowledges receipt -> sender gets a delivered receipt.
  const deliveredStatus = waitFor(aliceSocket, 'message:status');
  bobSocket.emit('message:delivered', { roomId: room.id, messageId: liveSend.message.id });
  const liveDelivered = await deliveredStatus;
  check('recipient ack marks message delivered',
    liveDelivered.status === 'delivered' && liveDelivered.messageIds.includes(liveSend.message.id));

  // Idempotency: re-sending with the same clientId must not create a duplicate.
  const clientId = 'client-abc-123';
  const first = await emitAck(aliceSocket, 'message:send', {
    roomId: room.id, type: 'text', content: 'idempotent hi', clientId
  });
  const second = await emitAck(aliceSocket, 'message:send', {
    roomId: room.id, type: 'text', content: 'idempotent hi', clientId
  });
  check('duplicate clientId returns the same message', first.message.id === second.message.id);

  // --- Read receipts ---
  const readStatus = waitFor(aliceSocket, 'message:status');
  bobSocket.emit('message:read', { roomId: room.id });
  const read = await readStatus;
  check('message:read notifies sender with read status',
    read.status === 'read' && read.messageIds.includes(liveSend.message.id));

  // --- Typing ---
  const typingPromise = waitFor(bobSocket, 'typing');
  aliceSocket.emit('typing', { roomId: room.id, isTyping: true });
  const typing = await typingPromise;
  check('typing indicator reaches the other user',
    typing.userId === alice.user.id && typing.isTyping === true && typing.roomId === room.id);

  // --- Validation guards ---
  const tooBig = await emitAck(aliceSocket, 'message:send', {
    roomId: room.id, type: 'text', content: 'x'.repeat(6000)
  });
  check('oversized message rejected', tooBig.ok === false);

  const badImage = await emitAck(aliceSocket, 'message:send', {
    roomId: room.id, type: 'image', content: 'https://not-a-data-uri'
  });
  check('non-data-URI image rejected', badImage.ok === false);

  const foreignSend = await emitAck(bobSocket, 'message:send', {
    roomId: 'dm_a_b', type: 'text', content: 'sneaky'
  });
  check('sending into a foreign room rejected', foreignSend.ok === false);

  // --- History ---
  const history = await api(`/rooms/${room.id}/messages?limit=50`, {}, bob.token);
  const msgs = history.body?.messages || [];
  check('history returns all messages in order',
    msgs.length === 3 &&
    msgs[0].content === 'sent while you were away' &&
    msgs[1].content === 'hello bob!' &&
    msgs[2].content === 'idempotent hi');
  check('history reflects read status', msgs.every((m) => m.status === 'read'));

  const unknownCursor = await api(`/rooms/${room.id}/messages?before=does-not-exist`, {}, bob.token);
  check('history with unknown cursor returns empty (no silent restart)',
    (unknownCursor.body?.messages || []).length === 0 && unknownCursor.body?.hasMore === false);

  const aliceUsers = await api('/users', {}, alice.token);
  const bobEntry = aliceUsers.body.users.find((u) => u.id === bob.user.id);
  check('sidebar shows room, last message and online flag',
    bobEntry.roomId === room.id && bobEntry.lastMessage.content === 'idempotent hi' && bobEntry.online === true);
  check('GET /users does NOT leak other users\' phone numbers', bobEntry.phone === undefined);

  // --- Presence offline ---
  const offlinePromise = waitFor(aliceSocket, 'presence:update');
  bobSocket.disconnect();
  const offline = await offlinePromise;
  check('presence:update fires with lastSeenAt when Bob disconnects',
    offline.userId === bob.user.id && offline.online === false && !!offline.lastSeenAt);

  aliceSocket.disconnect();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E run crashed:', err);
  process.exit(1);
});
