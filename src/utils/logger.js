const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL] || LEVELS.info;

function write(level, args) {
  if (LEVELS[level] < threshold) return;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  // eslint-disable-next-line no-console
  (level === 'error' ? console.error : console.log)(line, ...args);
}

module.exports = {
  debug: (...args) => write('debug', args),
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args)
};
