const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Tiny JSON-file persistence used by the repositories.
 * Reads synchronously once at startup, then batches writes (atomic
 * temp-file + rename) so a crash never leaves a half-written file.
 * Swap this layer for a real database without touching the services.
 */
class JsonStore {
  constructor(filePath, defaultValue) {
    this.filePath = filePath;
    this.saveTimer = null;
    this.data = this.load(defaultValue);
  }

  load(defaultValue) {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      }
    } catch (err) {
      logger.error(`Failed to read ${this.filePath}, starting empty:`, err.message);
    }
    return defaultValue;
  }

  /** Schedule a debounced save; multiple mutations collapse into one write. */
  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 100);
    // Do not keep the process alive just to persist.
    if (this.saveTimer.unref) this.saveTimer.unref();
  }

  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      logger.error(`Failed to persist ${this.filePath}:`, err.message);
    }
  }
}

const stores = [];

function createStore(filePath, defaultValue) {
  const store = new JsonStore(filePath, defaultValue);
  stores.push(store);
  return store;
}

/** Flush every store synchronously - called on shutdown. */
function flushAll() {
  stores.forEach((s) => s.flush());
}

module.exports = { createStore, flushAll };
