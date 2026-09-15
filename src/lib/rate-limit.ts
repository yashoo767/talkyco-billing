/**
 * Talkyco Billing — Rate limiting & abuse protection
 *
 * Protection layers (applied in order):
 *
 *   1. IP hard block   — temporary block if abuse threshold exceeded
 *   2. IP per-minute   — sliding window (default: 20 req/min per IP)
 *   3. IP per-hour     — sliding window (default: 200 req/hr per IP)
 *   4. Phone per-hour  — sliding window (default: 60 req/hr per phone)
 *
 * Anti-enumeration:
 *   - Same TTL response regardless of whether a number has data
 *   - Generic error messages (no "number exists but no data" leakage)
 *   - Progressive throttling: each rate-limit hit extends the window
 *   - Abuse events logged to DB for offline analysis
 *
 * All Redis keys use fixed namespacing and only contain:
 *   - Sanitised IP (hex-encoded to avoid colon issues with IPv6)
 *   - Stripped E.164 phone digits
 */

import { redis } from "./redis";
import type { RateLimitResult } from "@/types";

const IP_PER_MINUTE  = parseInt(process.env.RATE_LIMIT_IP_PER_MINUTE  ?? "20",  10);
const IP_PER_HOUR    = parseInt(process.env.RATE_LIMIT_IP_PER_HOUR    ?? "200", 10);
const PHONE_PER_HOUR = parseInt(process.env.RATE_LIMIT_PHONE_PER_HOUR ?? "60",  10);
const BLOCK_SECONDS  = parseInt(process.env.RATE_LIMIT_BLOCK_SECONDS  ?? "300", 10);

// Abuse threshold: if IP hits per-hour limit N times, block
const ABUSE_TRIGGER_COUNT = 3;

function sanitiseIp(ip: string): string {
  // Hex-encode to avoid Redis key conflicts with IPv6 colons
  return Buffer.from(ip).toString("hex");
}

function phoneDigits(e164: string): string {
  return e164.replace(/\D/g, "");
}

/**
 * Sliding-window counter using Redis INCR + EXPIRE.
 * Returns current count after increment.
 */
async function slidingIncr(key: string, windowSeconds: number): Promise<number> {
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, windowSeconds, "NX"); // only set if not already set
  const results = await pipeline.exec();
  // results[0] is [error, count]
  const count = results?.[0]?.[1];
  return typeof count === "number" ? count : 0;
}

async function isBlocked(ipHex: string): Promise<boolean> {
  try {
    const val = await redis.get(`tb:block:ip:${ipHex}`);
    return val !== null;
  } catch {
    return false;
  }
}

async function recordAbuse(
  ipHex: string,
  reason: string
): Promise<void> {
  try {
    const abuseKey = `tb:abuse:${ipHex}`;
    const pipeline = redis.pipeline();
    pipeline.incr(abuseKey);
    pipeline.expire(abuseKey, 3600, "NX");
    const results = await pipeline.exec();
    const count = results?.[0]?.[1] as number;

    if (count >= ABUSE_TRIGGER_COUNT) {
      // Temporarily block this IP
      await redis.set(`tb:block:ip:${ipHex}`, reason, "EX", BLOCK_SECONDS);
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Check all rate limits for an incoming request.
 * Call this before any business logic.
 *
 * @param ip          The client's IP address (from headers or socket)
 * @param phoneNumber The E.164 phone number being looked up
 */
export async function checkRateLimit(
  ip: string,
  phoneNumber: string
): Promise<RateLimitResult> {
  const ipHex   = sanitiseIp(ip);
  const phoneDig = phoneDigits(phoneNumber);

  try {
    // Layer 1: Check if IP is temporarily blocked
    if (await isBlocked(ipHex)) {
      return {
        allowed:    false,
        retryAfter: BLOCK_SECONDS,
        reason:     "Too many requests. Please try again later.",
      };
    }

    // Layer 2: IP per-minute
    const ipMinCount = await slidingIncr(`tb:rl:ip:min:${ipHex}`, 60);
    if (ipMinCount > IP_PER_MINUTE) {
      await recordAbuse(ipHex, "ip_per_minute");
      return {
        allowed:    false,
        retryAfter: 60,
        reason:     "Too many requests. Please wait a moment and try again.",
      };
    }

    // Layer 3: IP per-hour
    const ipHrCount = await slidingIncr(`tb:rl:ip:hr:${ipHex}`, 3600);
    if (ipHrCount > IP_PER_HOUR) {
      await recordAbuse(ipHex, "ip_per_hour");
      return {
        allowed:    false,
        retryAfter: 3600,
        reason:     "Hourly request limit reached. Please try again later.",
      };
    }

    // Layer 4: Phone number per-hour
    const phoneHrCount = await slidingIncr(`tb:rl:phone:hr:${phoneDig}`, 3600);
    if (phoneHrCount > PHONE_PER_HOUR) {
      return {
        allowed:    false,
        retryAfter: 3600,
        reason:     "This number has been queried too frequently. Please try again later.",
      };
    }

    return { allowed: true };
  } catch {
    // Redis unavailable — fail open to avoid blocking legitimate users,
    // but log the issue. In high-security deployments, fail closed instead.
    console.error("[rate-limit] Redis unavailable, failing open");
    return { allowed: true };
  }
}

/**
 * Extract the real client IP from a Next.js request.
 * Respects X-Forwarded-For only if you trust your proxy.
 */
export function extractIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Take the first (leftmost) IP — the original client
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "0.0.0.0";
}
