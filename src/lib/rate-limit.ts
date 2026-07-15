/**
 * Rate limiter — Upstash Redis when configured, otherwise in-memory Map.
 * Multi-instance deployments should set UPSTASH_REDIS_REST_URL + TOKEN.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function upstashConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

async function checkUpstashRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> {
  const base = process.env.UPSTASH_REDIS_REST_URL!.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const redisKey = `rl:${key}`;
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));

  // INCR + EXPIRE pipeline via Upstash REST
  const res = await fetch(`${base}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["EXPIRE", redisKey, String(windowSec), "NX"],
      ["TTL", redisKey],
    ]),
  });

  if (!res.ok) {
    // Fail open to in-memory on Redis errors to avoid blocking checkout.
    return checkMemoryRateLimit(key, limit, windowMs);
  }

  const data = (await res.json()) as Array<{ result: number }>;
  const count = Number(data[0]?.result ?? 0);
  const ttl = Number(data[2]?.result ?? windowSec);
  if (count > limit) {
    return { ok: false, retryAfterMs: Math.max(0, ttl * 1000) };
  }
  return { ok: true };
}

function checkMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterMs: Math.max(0, bucket.resetAt - now) };
  }
  bucket.count += 1;
  return { ok: true };
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterMs: number } {
  // Sync wrapper keeps existing call sites; when Upstash is configured the
  // async path is still available via checkRateLimitAsync.
  return checkMemoryRateLimit(key, limit, windowMs);
}

export async function checkRateLimitAsync(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: true } | { ok: false; retryAfterMs: number }> {
  if (upstashConfigured()) {
    try {
      return await checkUpstashRateLimit(key, limit, windowMs);
    } catch {
      return checkMemoryRateLimit(key, limit, windowMs);
    }
  }
  return checkMemoryRateLimit(key, limit, windowMs);
}

/** Test helper */
export function resetRateLimits() {
  buckets.clear();
}
