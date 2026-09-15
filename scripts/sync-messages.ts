/**
 * Talkyco Billing — Background sync script
 *
 * Fetches messages from the provider and upserts them into the local database,
 * then rebuilds daily_aggregates for the affected date range.
 *
 * Usage:
 *   npm run sync
 *   # Or via cron: */15 * * * * cd /opt/talkyco-billing && npm run sync >> /var/log/talkyco-sync.log 2>&1
 *
 * This script is server-side only. It never runs in the browser.
 * Credentials are read from environment variables only.
 */

import "dotenv/config";
import Twilio from "twilio";
import Decimal from "decimal.js";
import { PrismaClient, MessageDirection, MessageStatus } from "@prisma/client";
import { subDays, format, parseISO } from "date-fns";

const prisma = new PrismaClient();

const ACCOUNT_SID   = process.env.MESSAGING_ACCOUNT_SID!;
const AUTH_TOKEN    = process.env.MESSAGING_AUTH_TOKEN!;
const SYNC_DAYS_BACK = parseInt(process.env.SYNC_DAYS_BACK ?? "7", 10);
const PAGE_SIZE      = 100;

if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error("[sync] MESSAGING_ACCOUNT_SID and MESSAGING_AUTH_TOKEN must be set.");
  process.exit(1);
}

const client = Twilio(ACCOUNT_SID, AUTH_TOKEN);

// ─── Helpers ──────────────────────────────────────────────────────────────

function normalizeCost(price: string | null | undefined): string {
  if (!price) return "0";
  return new Decimal(price).abs().toFixed(7).replace(/\.?0+$/, "") || "0";
}

function normalizeDirection(direction: string): MessageDirection {
  return direction === "inbound" ? MessageDirection.INBOUND : MessageDirection.OUTBOUND;
}

function normalizeStatus(status: string): MessageStatus {
  const map: Record<string, MessageStatus> = {
    delivered:   MessageStatus.DELIVERED,
    sent:        MessageStatus.SENT,
    failed:      MessageStatus.FAILED,
    undelivered: MessageStatus.UNDELIVERED,
    received:    MessageStatus.RECEIVED,
    queued:      MessageStatus.QUEUED,
    sending:     MessageStatus.SENDING,
  };
  return map[status] ?? MessageStatus.OTHER;
}

// ─── Fetch & upsert ───────────────────────────────────────────────────────

async function syncDateRange(dateStart: Date, dateEnd: Date) {
  const dateSentBefore = new Date(dateEnd);
  dateSentBefore.setUTCDate(dateSentBefore.getUTCDate() + 1);

  console.log(
    `[sync] Fetching messages ${format(dateStart, "yyyy-MM-dd")} → ${format(dateEnd, "yyyy-MM-dd")}`
  );

  const messages = await client.messages.list({
    dateSentAfter:  dateStart,
    dateSentBefore: dateSentBefore,
    pageSize:       PAGE_SIZE,
  });

  console.log(`[sync] Fetched ${messages.length} messages`);

  let upserted = 0;
  for (const m of messages) {
    // Determine which phone number to attribute this cost to
    // For outbound: the From number (our Twilio number)
    // For inbound:  the To number (our Twilio number)
    const phoneNumber =
      m.direction === "inbound" ? m.to : m.from;

    try {
      await prisma.message.upsert({
        where:  { providerMsgId: m.sid },
        create: {
          providerMsgId: m.sid,
          phoneNumber,
          direction:     normalizeDirection(m.direction),
          status:        normalizeStatus(m.status),
          numSegments:   parseInt(String(m.numSegments), 10) || 1,
          actualCost:    normalizeCost(m.price),
          currency:      (m.priceUnit ?? "USD").toUpperCase(),
          sentAt:        new Date(m.dateSent as unknown as string),
        },
        update: {
          status:     normalizeStatus(m.status),
          actualCost: normalizeCost(m.price),
        },
      });
      upserted++;
    } catch (err) {
      console.error(`[sync] Failed to upsert message ${m.sid}:`, err);
    }
  }

  console.log(`[sync] Upserted ${upserted} messages`);
  return messages;
}

// ─── Rebuild daily aggregates ─────────────────────────────────────────────

async function rebuildAggregates(dateStart: Date, dateEnd: Date) {
  console.log("[sync] Rebuilding daily aggregates…");

  // Get all distinct phone numbers with messages in range
  const phones = await prisma.message.findMany({
    where: {
      sentAt: { gte: dateStart, lte: dateEnd },
    },
    select: { phoneNumber: true },
    distinct: ["phoneNumber"],
  });

  for (const { phoneNumber } of phones) {
    const cursor = new Date(dateStart);
    while (cursor <= dateEnd) {
      const dayStart = new Date(cursor);
      const dayEnd   = new Date(cursor);
      dayEnd.setUTCHours(23, 59, 59, 999);

      const msgs = await prisma.message.findMany({
        where: {
          phoneNumber,
          sentAt: { gte: dayStart, lte: dayEnd },
        },
      });

      const outbound  = msgs.filter((m) => m.direction === MessageDirection.OUTBOUND).length;
      const inbound   = msgs.filter((m) => m.direction === MessageDirection.INBOUND).length;
      const segments  = msgs.reduce((s, m) => s + m.numSegments, 0);
      const totalCost = msgs.reduce(
        (acc, m) => acc.plus(new Decimal(m.actualCost)),
        new Decimal("0")
      );

      await prisma.dailyAggregate.upsert({
        where: {
          phoneNumber_date: {
            phoneNumber,
            date: new Date(format(cursor, "yyyy-MM-dd") + "T00:00:00.000Z"),
          },
        },
        create: {
          phoneNumber,
          date:         new Date(format(cursor, "yyyy-MM-dd") + "T00:00:00.000Z"),
          outboundCount: outbound,
          inboundCount:  inbound,
          totalSegments: segments,
          actualCost:    totalCost.toFixed(7),
          currency:      msgs[0]?.currency ?? "USD",
        },
        update: {
          outboundCount: outbound,
          inboundCount:  inbound,
          totalSegments: segments,
          actualCost:    totalCost.toFixed(7),
          computedAt:    new Date(),
        },
      });

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  console.log(`[sync] Rebuilt aggregates for ${phones.length} phone numbers`);
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const dateEnd   = new Date();
  dateEnd.setUTCHours(23, 59, 59, 999);
  const dateStart = subDays(dateEnd, SYNC_DAYS_BACK);
  dateStart.setUTCHours(0, 0, 0, 0);

  try {
    await syncDateRange(dateStart, dateEnd);
    await rebuildAggregates(dateStart, dateEnd);
    console.log("[sync] Completed successfully.");
  } catch (err) {
    console.error("[sync] Fatal error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
