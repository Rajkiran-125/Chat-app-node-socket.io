require('dotenv').config();
const path = require('path');

const DEFAULT_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:3000',
  'https://chat-app-frontend-12bbe.web.app',
  'https://chat-app-frontend-12bbe.firebaseapp.com'
];

const rawOrigins = (process.env.CORS_ORIGINS || '').trim();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-do-not-use-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigins: rawOrigins === '*' ? '*' : rawOrigins ? rawOrigins.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_ORIGINS,
  dataDir: process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, '..', '..', 'data'),
  keepAliveUrl: (process.env.KEEP_ALIVE_URL || '').trim(),
  limits: {
    userNameMin: 2,
    userNameMax: 40,
    phoneMin: 4,
    phoneMax: 15,
    avatarMax: 10_000,
    textMessageMax: 5_000,
    // ~500 KB binary once base64-decoded
    imageDataUrlMax: 700_000,
    historyPageMax: 100
  }
};

module.exports = config;
