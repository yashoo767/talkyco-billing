// ─── Public-facing types (safe to serialize to API responses) ──────────────
// These types must NEVER include internal fields such as:
//   provider IDs, auth tokens, account SIDs, raw API responses,
//   internal DB IDs, message bodies, or actual_cost.

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "custom";

export interface DateRange {
  start: string; // ISO date string YYYY-MM-DD
  end:   string;
}

// Public daily usage row — safe for client
export interface PublicDailyUsage {
  date:          string; // "YYYY-MM-DD"
  outbound:      number;
  inbound:       number;
  total:         number;
  segments:      number;
  customerCost:  string; // formatted "0.00", calculated server-side
  currency:      string;
}

// Public aggregate summary — safe for client
export interface PublicUsageSummary {
  phoneNumber:  string;
  dateStart:    string;
  dateEnd:      string;
  outbound:     number;
  inbound:      number;
  total:        number;
  segments:     number;
  customerCost: string; // formatted "0.00", calculated server-side
  currency:     string;
  daily:        PublicDailyUsage[];
  cachedAt:     string; // ISO timestamp, for UI freshness indicator
  dataSource:   "live" | "cached";
}

// API error response — generic, never exposes internal details
export interface ApiError {
  error:   string;
  code:    string;
}

// Lookup request params (validated server-side)
export interface LookupParams {
  phoneNumber: string; // E.164 normalized
  dateStart:   string;
  dateEnd:     string;
}

// ─── Internal types (never returned to client) ────────────────────────────
export interface InternalDailyUsage {
  date:        string;
  outbound:    number;
  inbound:     number;
  total:       number;
  segments:    number;
  actualCost:  string; // exact decimal string
  currency:    string;
}

export interface InternalUsageSummary {
  phoneNumber: string;
  dateStart:   string;
  dateEnd:     string;
  outbound:    number;
  inbound:     number;
  total:       number;
  segments:    number;
  actualCost:  string; // exact decimal string
  currency:    string;
  daily:       InternalDailyUsage[];
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number; reason: string };
