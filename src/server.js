const http = require('http');
const config = require('./config');
const logger = require('./utils/logger');
const app = require('./app');
const { createSocketServer } = require('./sockets/socket-manager');
const mongoStore = require('./store/mongo-store');

// Fail closed: never serve production traffic with the public dev secret,
// otherwise anyone could forge a valid token for any user id.
if (config.env === 'production' && config.jwtSecret === 'dev-secret-do-not-use-in-production') {
  logger.error('FATAL: JWT_SECRET is not set in production. Set a long random JWT_SECRET and restart.');
  process.exit(1);
}

const server = http.createServer(app);
const io = createSocketServer(server);

// Connect to MongoDB before accepting traffic — a live DB is required to serve
// any request, so fail fast (exit 1) if the connection can't be established.
async function start() {
  try {
    await mongoStore.connect();
  } catch (err) {
    logger.error(`FATAL: could not connect to MongoDB: ${err.message}`);
    process.exit(1);
    return;
  }

  server.listen(config.port, () => {
    logger.info(`ChatApp API listening on port ${config.port} (${config.env})`);
  });
}

start();

// Optional keep-alive ping for free-tier hosts that sleep on idle.
if (config.keepAliveUrl) {
  const interval = setInterval(() => {
    fetch(config.keepAliveUrl)
      .then((res) => logger.debug(`keep-alive ping: ${res.status}`))
      .catch((err) => logger.warn(`keep-alive ping failed: ${err.message}`));
  }, 10 * 60 * 1000);
  interval.unref();
}

function shutdown(signal) {
  logger.info(`${signal} received, shutting down...`);
  // Close sockets first so disconnect handlers fire, then drain HTTP and close
  // the DB connection last.
  io.close();
  server.close(() => {
    mongoStore.close().finally(() => process.exit(0));
  });
  // Force-exit if connections refuse to drain (still close the DB first).
  setTimeout(() => {
    mongoStore.close().finally(() => process.exit(0));
  }, 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
