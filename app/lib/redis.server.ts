import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | null | undefined;
};

// Optional: returns null when REDIS_URL is not configured so callers can degrade gracefully.
function createClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
    enableOfflineQueue: false,
  });
  client.on("error", (err) => {
    console.error("[redis] connection error:", err.message);
  });
  return client;
}

export const redis: Redis | null =
  globalForRedis.redis ?? (globalForRedis.redis = createClient());

// Sliding-window rate limiter. Returns true when the action is allowed.
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<{ allowed: boolean; remaining: number }> {
  if (!redis) return { allowed: true, remaining: limit };
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSec);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    // Fail open if Redis is unavailable.
    return { allowed: true, remaining: limit };
  }
}
