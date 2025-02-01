interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
}

interface RateLimit {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private limits: Map<string, RateLimit>;
  private options: RateLimiterOptions;

  constructor(options: RateLimiterOptions) {
    this.limits = new Map();
    this.options = options;
  }

  checkLimit(key: string): boolean {
    const now = Date.now();
    const limit = this.limits.get(key);

    if (!limit || now > limit.resetTime) {
      this.limits.set(key, {
        count: 0,
        resetTime: now + this.options.windowMs
      });
      return true;
    }

    return limit.count < this.options.maxRequests;
  }

  incrementCounter(key: string): void {
    const limit = this.limits.get(key);
    if (limit) {
      limit.count++;
    }
  }
}
