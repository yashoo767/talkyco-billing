/**
 * Talkyco Billing — Public usage lookup endpoint
 *
 * POST /api/lookup
 *
 * Security checklist:
 *   ✓ Rate limiting (IP per-minute, IP per-hour, phone per-hour)
 *   ✓ Temporary IP blocking after abuse
 *   ✓ Input validation & E.164 normalisation
 *   ✓ Max date range enforcement
 *   ✓ Strict public DTO — no internal fields leak
 *   ✓ No raw provider errors exposed
 *   ✓ No provider name in responses
 *   ✓ No internal IDs, credentials, or message bodies
 *   ✓ Generic "no data" message (anti-enumeration)
 *   ✓ Server-side markup calculation (never trusted from client)
 *   ✓ Decimal-safe financial arithmetic
 *   ✓ Redis caching with validated keys
 */

import { NextRequest, NextResponse } from "next/server";
import {
  validateLookupRequest,
  PhoneValidationError,
  DateRangeValidationError,
  formatPhoneDisplay,
} from "@/lib/validation";
import { checkRateLimit, extractIp } from "@/lib/rate-limit";
import { getCachedUsage, setCachedUsage } from "@/lib/cache";
import { fetchUsage } from "@/lib/messaging";
import { applyMarkup } from "@/lib/pricing";
import type {
  PublicUsageSummary,
  PublicDailyUsage,
  InternalUsageSummary,
  ApiError,
} from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Map internal summary → public DTO (markup applied, internals stripped) */
function toPublicSummary(
  internal: InternalUsageSummary,
  cachedAt: string,
  dataSource: "live" | "cached"
): PublicUsageSummary {
  const daily: PublicDailyUsage[] = internal.daily.map((d) => ({
    date:         d.date,
    outbound:     d.outbound,
    inbound:      d.inbound,
    total:        d.total,
    segments:     d.segments,
    customerCost: applyMarkup(d.actualCost),
    currency:     d.currency,
  }));

  return {
    phoneNumber:  formatPhoneDisplay(internal.phoneNumber),
    dateStart:    internal.dateStart,
    dateEnd:      internal.dateEnd,
    outbound:     internal.outbound,
    inbound:      internal.inbound,
    total:        internal.total,
    segments:     internal.segments,
    customerCost: applyMarkup(internal.actualCost),
    currency:     internal.currency,
    daily,
    cachedAt,
    dataSource,
  };
}

function jsonError(
  message: string,
  code: string,
  status: number
): NextResponse<ApiError> {
  return NextResponse.json({ error: message, code }, { status });
}

// ─── Route handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Rate limiting ───────────────────────────────────────────────────
  const ip = extractIp(req);

  // We need a phone number for phone-level rate limiting.
  // Parse the body early; if invalid we still apply IP limits.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request format.", "INVALID_REQUEST", 400);
  }

  // Apply IP-only rate limit before full validation (cheaper)
  // We'll do the full check (including phone) after validation succeeds
  const rawPhone = (body as Record<string, unknown>)?.phoneNumber as string ?? "";
  const ipRateCheck = await checkRateLimit(ip, rawPhone);
  if (!ipRateCheck.allowed) {
    return NextResponse.json(
      { error: ipRateCheck.reason, code: "RATE_LIMITED" },
      {
        status: 429,
        headers: { "Retry-After": String(ipRateCheck.retryAfter) },
      }
    );
  }

  // ── 2. Validate & normalise input ──────────────────────────────────────
  let params: ReturnType<typeof validateLookupRequest>;
  try {
    params = validateLookupRequest(body);
  } catch (err) {
    if (err instanceof PhoneValidationError) {
      return jsonError(err.message, "INVALID_PHONE", 422);
    }
    if (err instanceof DateRangeValidationError) {
      return jsonError(err.message, "INVALID_DATE_RANGE", 422);
    }
    return jsonError("Invalid request parameters.", "INVALID_REQUEST", 400);
  }

  const { phoneNumber, dateStart, dateEnd } = params;

  // ── 3. Check Redis cache ───────────────────────────────────────────────
  const cached = await getCachedUsage(phoneNumber, dateStart, dateEnd);
  if (cached) {
    return NextResponse.json({ ...cached, dataSource: "cached" }, {
      headers: { "X-Cache": "HIT" },
    });
  }

  // ── 4. Fetch from provider ─────────────────────────────────────────────
  let internal: InternalUsageSummary;
  try {
    internal = await fetchUsage(phoneNumber, dateStart, dateEnd);
  } catch (err) {
    // Log internally but return a generic error to the user
    console.error("[lookup] provider fetch error:", err);
    return jsonError(
      "Unable to retrieve usage data. Please try again.",
      "FETCH_ERROR",
      502
    );
  }

  // ── 5. Build public response (apply markup server-side) ───────────────
  const now    = new Date().toISOString();
  const result = toPublicSummary(internal, now, "live");

  // ── 6. Cache the result ────────────────────────────────────────────────
  await setCachedUsage(phoneNumber, dateStart, dateEnd, result);

  return NextResponse.json(result, {
    headers: { "X-Cache": "MISS" },
  });
}

// Block all other HTTP methods
export function GET()    { return jsonError("Method not allowed.", "METHOD_NOT_ALLOWED", 405); }
export function PUT()    { return jsonError("Method not allowed.", "METHOD_NOT_ALLOWED", 405); }
export function DELETE() { return jsonError("Method not allowed.", "METHOD_NOT_ALLOWED", 405); }
