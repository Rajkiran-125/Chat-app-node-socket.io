const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const routes = require('./routes');
const { apiLimiter } = require('./middleware/rate-limiter');
const { notFoundHandler, errorHandler } = require('./middleware/error-handler');

const app = express();

// Render/other PaaS run behind a reverse proxy; needed for correct client IPs
// (rate limiting) and secure cookies.
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: config.corsOrigins === '*' ? true : config.corsOrigins,
    credentials: true
  })
);
app.use(express.json({ limit: '1mb' }));

// Simple landing/health page.
app.get('/', (req, res) => {
  res.send(
    '<h1 style="font-family:sans-serif;text-align:center;margin-top:3rem;">ChatApp API v2.0 &mdash; running</h1>'
  );
});

app.use('/api', apiLimiter, routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
