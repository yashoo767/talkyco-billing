/**
 * Talkyco Billing — Messaging provider integration
 *
 * This module is the ONLY place that interacts with the external messaging API.
 * Provider names, credentials, account SIDs, and raw API responses
 * must NEVER leave this module or appear in public API responses.
 *
 * Twilio notes (verified against docs as of 2025):
 *   - Messages.list() filters: from, to, dateSentAfter, dateSentBefore
 *   - `price` field: negative decimal string e.g. "-0.0075" (cost, not revenue)
 *   - `numSegments`: total SMS segments for the message
 *   - `direction`: "inbound" | "outbound-api" | "outbound-call" | "outbound-reply"
 *   - To fetch all messages to/from a number, two separate queries are needed
 *     (Twilio does not support OR filtering in a single request).
 *   - Price is attributed per message (segments already factored in).
 *   - Account-level fees (e.g. phone number rental) cannot be attributed
 *     to individual messages — they are NOT included in these totals.
 *     The totals here represent MESSAGE costs only.
 */

import Twilio from "twilio";
import Decimal from "decimal.js";
import type { InternalDailyUsage, InternalUsageSummary } from "@/types";

// Lazy-init client — credentials never leave this module
let _client: ReturnType<typeof Twilio> | null = null;

function getClient() {
  if (!_client) {
    const sid   = process.env.MESSAGING_ACCOUNT_SID;
    const token = process.env.MESSAGING_AUTH_TOKEN;
    if (!sid || !token) {
      throw new Error("Messaging credentials not configured.");
    }
    _client = Twilio(sid, token);
  }
  return _client;
}

// ─── Types ────────────────────────────────────────────────────────────────

interface RawMessageRecord {
  direction:   "inbound" | "outbound";
  status:      string;
  numSegments: number;
  actualCost:  string; // e.g. "0.0075" — absolute value, always non-negative
  sentAt:      Date;
  currency:    string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Normalise Twilio `price` (negative string like "-0.0075") to a positive
 * decimal cost string ("0.0075").  Returns "0" if null/empty.
 */
function normalizeCost(price: string | null | undefined): string {
  if (!price) return "0";
  const d = new Decimal(price);
  // Twilio returns negative values for charges
  return d.abs().toFixed(7).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

function normalizeDirection(
  direction: string
): "inbound" | "outbound" {
  return direction === "inbound" ? "inbound" : "outbound";
}

function normalizeStatus(status: string): string {
  const known = [
    "delivered","sent","failed","undelivered",
    "received","queued","sending",
  ];
  return known.includes(status) ? status : "other";
}

// ─── Core fetch ───────────────────────────────────────────────────────────

const PAGE_SIZE = 100; // Twilio max page size

/**
 * Fetch all messages where the given phone number appears as From or To,
 * within the date range [dateStart, dateEnd] (inclusive, UTC).
 *
 * Returns raw internal records — caller must compute aggregates.
 */
async function fetchRawMessages(
  phoneNumber: string,
  dateStart: Date,
  dateEnd: Date,
  signal?: AbortSignal
): Promise<RawMessageRecord[]> {
  const client = getClient();

  // Twilio uses exclusive upper bound for DateSent, so add 1 day to end
  const dateSentBefore = new Date(dateEnd);
  dateSentBefore.setUTCDate(dateSentBefore.getUTCDate() + 1);

  const sharedParams = {
    dateSentAfter:  dateStart,
    dateSentBefore: dateSentBefore,
    pageSize:       PAGE_SIZE,
  } as const;

  // Two parallel queries: messages FROM this number + messages TO this number
  const [fromMsgs, toMsgs] = await Promise.all([
    client.messages.list({ ...sharedParams, from: phoneNumber }),
    client.messages.list({ ...sharedParams, to:   phoneNumber }),
  ]);

  // Merge and deduplicate by SID
  const seen = new Set<string>();
  const all  = [...fromMsgs, ...toMsgs].filter((m) => {
    if (seen.has(m.sid)) return false;
    seen.add(m.sid);
    return true;
  });

  return all.map((m) => ({
    direction:   normalizeDirection(m.direction),
    status:      normalizeStatus(m.status),
    numSegments: parseInt(String(m.numSegments), 10) || 1,
    actualCost:  normalizeCost(m.price),
    sentAt:      new Date(m.dateSent as unknown as string),
    currency:    (m.priceUnit ?? "USD").toUpperCase(),
  }));
}

// ─── Aggregation ──────────────────────────────────────────────────────────

function aggregateByDay(
  records: RawMessageRecord[],
  dateStart: Date,
  dateEnd: Date
): InternalDailyUsage[] {
  // Build a map keyed by YYYY-MM-DD
  const map = new Map<string, InternalDailyUsage>();

  // Pre-populate all dates in range with zeros so we return complete rows
  const cursor = new Date(dateStart);
  while (cursor <= dateEnd) {
    const key = cursor.toISOString().slice(0, 10);
    map.set(key, {
      date:       key,
      outbound:   0,
      inbound:    0,
      total:      0,
      segments:   0,
      actualCost: "0",
      currency:   "USD",
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Accumulate
  for (const r of records) {
    const key = r.sentAt.toISOString().slice(0, 10);
    const row = map.get(key);
    if (!row) continue; // outside requested range — skip

    if (r.direction === "outbound") row.outbound += 1;
    else                            row.inbound  += 1;
    row.total    += 1;
    row.segments += r.numSegments;
    row.actualCost = new Decimal(row.actualCost)
      .plus(new Decimal(r.actualCost))
      .toFixed(7);
    row.currency = r.currency;
  }

  // Sort ascending by date
  return Array.from(map.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

// ─── Public function ──────────────────────────────────────────────────────

/**
 * Retrieve messaging usage for a phone number over a date range.
 * Returns internal summary — caller applies markup before responding.
 *
 * NOTE: Only message-level costs are included.
 *       Phone-number rental and other account-level fees cannot be
 *       reliably attributed to individual numbers and are excluded.
 */
export async function fetchUsage(
  phoneNumber: string,
  dateStartStr: string,
  dateEndStr: string
): Promise<InternalUsageSummary> {
  const dateStart = new Date(dateStartStr + "T00:00:00.000Z");
  const dateEnd   = new Date(dateEndStr   + "T23:59:59.999Z");

  const records = await fetchRawMessages(phoneNumber, dateStart, dateEnd);
  const daily   = aggregateByDay(records, dateStart, dateEnd);

  // Compute totals from aggregated daily rows
  let outbound   = 0;
  let inbound    = 0;
  let segments   = 0;
  let totalCost  = new Decimal("0");

  for (const d of daily) {
    outbound  += d.outbound;
    inbound   += d.inbound;
    segments  += d.segments;
    totalCost  = totalCost.plus(new Decimal(d.actualCost));
  }

  return {
    phoneNumber,
    dateStart:   dateStartStr,
    dateEnd:     dateEndStr,
    outbound,
    inbound,
    total:       outbound + inbound,
    segments,
    actualCost:  totalCost.toFixed(7),
    currency:    daily[0]?.currency ?? "USD",
    daily,
  };
}
