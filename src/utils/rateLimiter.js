class RateLimiter {
  constructor(maxRequests, timeWindow) {
    this.maxRequests = maxRequests; // Maximum requests allowed
    this.timeWindow = timeWindow; // Time window in milliseconds
    this.queue = [];
  }

  async waitForSlot() {
    const now = Date.now();

    // Remove timestamps outside the time window
    this.queue = this.queue.filter(timestamp => now - timestamp < this.timeWindow);

    // If we've hit the limit, wait until a slot opens up
    if (this.queue.length >= this.maxRequests) {
      const oldestTimestamp = this.queue[0];
      const waitTime = this.timeWindow - (now - oldestTimestamp);

      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.waitForSlot(); // Recursively check again
      }
    }

    // Add current timestamp to queue
    this.queue.push(Date.now());
  }

  reset() {
    this.queue = [];
  }

  getStatus() {
    const now = Date.now();
    this.queue = this.queue.filter(timestamp => now - timestamp < this.timeWindow);

    return {
      currentRequests: this.queue.length,
      maxRequests: this.maxRequests,
      timeWindow: this.timeWindow,
      available: this.maxRequests - this.queue.length
    };
  }
}

module.exports = RateLimiter;
