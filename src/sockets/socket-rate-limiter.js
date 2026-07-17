/**
 * Per-socket sliding-window rate limiter. One instance per connection guards
 * against a single client flooding events (message/typing/status) and
 * exhausting memory + disk. Buckets are keyed by event category.
 */
function createSocketRateLimiter(windowMs = 10_000) {
  const hits = new Map(); // category -> number[] (timestamps)

  return {
    /** Returns true if this call is within `max` calls per window for `category`. */
    allow(category, max) {
      const now = Date.now();
      const arr = (hits.get(category) || []).filter((t) => now - t < windowMs);
      if (arr.length >= max) {
        hits.set(category, arr);
        return false;
      }
      arr.push(now);
      hits.set(category, arr);
      return true;
    }
  };
}

module.exports = { createSocketRateLimiter };
