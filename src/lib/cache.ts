/**
 * Talkyco Billing — Redis-based result cache
 *
 * TTL strategy (configurable via env):
 *   "today"     → CACHE_TTL_TODAY     default: 120 s  (2 min)
 *   "yesterday" → CACHE_TTL_YESTERDAY default: 900 s  (15 min)
 *   historical  → CACHE_TTL_HISTORICAL default: 3600 s (1 hr)
 *
 * Cache keys are namespaced and contain only the normalised phone number
 * and the date range — never credentials or internal identifiers.
 *
 * Cache-poisoning prevention:
 *   Keys are built exclusively from server-validated, normalised inputs.
 *   Raw user input is never used as a cache key.
 */

import { redis } from "./redis";
import type { PublicUsageSummary } from "@/types";

const TTL_TODAY      = parseInt(process.env.CACHE_TTL_TODAY      ?? "120",  10);
const TTL_YESTERDAY  = parseInt(process.env.CACHE_TTL_YESTERDAY  ?? "900",  10);
const TTL_HISTORICAL = parseInt(process.env.CACHE_TTL_HISTORICAL ?? "3600", 10);

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayString(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Determine the appropriate TTL for a given date range.
 * Short TTL if range includes today; medium if only yesterday;
 * long for fully historical ranges.
 */
function selectTtl(dateStart: string, dateEnd: string): number {
  const today     = todayString();
  const yesterday = yesterdayString();

  if (dateEnd >= today)     return TTL_TODAY;
  if (dateEnd >= yesterday) return TTL_YESTERDAY;
  return TTL_HISTORICAL;
}

/**
 * Build a deterministic, safe Redis key.
 * Keys contain only validated E.164 phones and ISO dates.
 */
function buildKey(phoneNumber: string, dateStart: string, dateEnd: string): string {
  // Strip '+' for Redis key safety (though Redis supports it, keeps keys clean)
  const phone = phoneNumber.replace(/\D/g, "");
  return `tb:usage:${phone}:${dateStart}:${dateEnd}`;
}

export async function getCachedUsage(
  phoneNumber: string,
  dateStart: string,
  dateEnd: string
): Promise<PublicUsageSummary | null> {
  try {
    const key  = buildKey(phoneNumber, dateStart, dateEnd);
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as PublicUsageSummary;
  } catch {
    // Cache miss on error — fall through to live fetch
    return null;
  }
}

export async function setCachedUsage(
  phoneNumber: string,
  dateStart: string,
  dateEnd: string,
  result: PublicUsageSummary
): Promise<void> {
  try {
    const key = buildKey(phoneNumber, dateStart, dateEnd);
    const ttl = selectTtl(dateStart, dateEnd);
    await redis.set(key, JSON.stringify(result), "EX", ttl);
  } catch {
    // Non-fatal — continue without caching
  }
}

export async function invalidateCache(
  phoneNumber: string,
  dateStart: string,
  dateEnd: string
): Promise<void> {
  try {
    const key = buildKey(phoneNumber, dateStart, dateEnd);
    await redis.del(key);
  } catch {
    // Non-fatal
  }
}
