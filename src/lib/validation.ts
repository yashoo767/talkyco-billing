/**
 * Talkyco Billing — Input validation & sanitisation
 *
 * All validation is performed server-side.
 * Never trust client-supplied parameters.
 */

import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
} from "libphonenumber-js";
import { z } from "zod";
import {
  startOfDay,
  endOfDay,
  parseISO,
  isValid,
  differenceInDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  subDays,
  format,
} from "date-fns";
import type { DateRange, LookupParams } from "@/types";

const MAX_RANGE_DAYS = parseInt(process.env.MAX_DATE_RANGE_DAYS ?? "31", 10);

// ─── Phone number ─────────────────────────────────────────────────────────

export class PhoneValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhoneValidationError";
  }
}

/**
 * Normalise a raw phone-number string to E.164 format.
 * Throws PhoneValidationError if the number is invalid.
 * Default region assumption: US (+1).
 */
export function normalizePhoneNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new PhoneValidationError("Phone number is required.");

  const parsed = parsePhoneNumberFromString(trimmed, "US");
  if (!parsed || !parsed.isValid()) {
    throw new PhoneValidationError(
      "Please enter a valid phone number (e.g. +1 415 555 1234)."
    );
  }
  return parsed.format("E.164"); // "+14155551234"
}

/**
 * Return a display-safe masked version of a phone number.
 * Full number displayed — masking is left optional per the spec note.
 * E.164 → formatted national-style for the UI.
 */
export function formatPhoneDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.formatInternational(); // "+1 415 555 1234"
}

// ─── Date range ───────────────────────────────────────────────────────────

export class DateRangeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateRangeValidationError";
  }
}

function todayUTC(): Date {
  return new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
}

export function resolveDateRange(
  preset: string,
  customStart?: string,
  customEnd?: string
): DateRange {
  const today = todayUTC();

  switch (preset) {
    case "today":
      return {
        start: format(today, "yyyy-MM-dd"),
        end:   format(today, "yyyy-MM-dd"),
      };

    case "yesterday": {
      const d = subDays(today, 1);
      return { start: format(d, "yyyy-MM-dd"), end: format(d, "yyyy-MM-dd") };
    }

    case "last7":
      return {
        start: format(subDays(today, 6), "yyyy-MM-dd"),
        end:   format(today, "yyyy-MM-dd"),
      };

    case "last30":
      return {
        start: format(subDays(today, 29), "yyyy-MM-dd"),
        end:   format(today, "yyyy-MM-dd"),
      };

    case "thisMonth":
      return {
        start: format(startOfMonth(today), "yyyy-MM-dd"),
        end:   format(today, "yyyy-MM-dd"),
      };

    case "lastMonth": {
      const lastMonth = subMonths(today, 1);
      return {
        start: format(startOfMonth(lastMonth), "yyyy-MM-dd"),
        end:   format(endOfMonth(lastMonth), "yyyy-MM-dd"),
      };
    }

    case "custom": {
      if (!customStart || !customEnd) {
        throw new DateRangeValidationError(
          "Please provide both a start and end date for a custom range."
        );
      }
      const s = parseISO(customStart);
      const e = parseISO(customEnd);
      if (!isValid(s) || !isValid(e)) {
        throw new DateRangeValidationError("Invalid date format. Use YYYY-MM-DD.");
      }
      if (s > e) {
        throw new DateRangeValidationError(
          "Start date must be on or before end date."
        );
      }
      if (s > today) {
        throw new DateRangeValidationError(
          "Start date cannot be in the future."
        );
      }
      const rangeDays = differenceInDays(e, s) + 1;
      if (rangeDays > MAX_RANGE_DAYS) {
        throw new DateRangeValidationError(
          `Date range cannot exceed ${MAX_RANGE_DAYS} days. For longer periods please contact support.`
        );
      }
      return {
        start: format(s, "yyyy-MM-dd"),
        end:   format(e > today ? today : e, "yyyy-MM-dd"),
      };
    }

    default:
      throw new DateRangeValidationError("Invalid date range selection.");
  }
}

// ─── Combined lookup params schema ────────────────────────────────────────

const lookupSchema = z.object({
  phoneNumber: z.string().min(1).max(20),
  preset:      z.string().min(1).max(20),
  dateStart:   z.string().optional(),
  dateEnd:     z.string().optional(),
});

export function validateLookupRequest(body: unknown): LookupParams {
  const parsed = lookupSchema.safeParse(body);
  if (!parsed.success) {
    throw new PhoneValidationError("Invalid request parameters.");
  }

  const { phoneNumber, preset, dateStart, dateEnd } = parsed.data;

  const e164 = normalizePhoneNumber(phoneNumber);
  const range = resolveDateRange(preset, dateStart, dateEnd);

  return {
    phoneNumber: e164,
    dateStart:   range.start,
    dateEnd:     range.end,
  };
}
