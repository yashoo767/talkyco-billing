"use client";

interface BillingCardProps {
  customerCost: string; // e.g. "55.47"
  currency:     string;
  dateStart:    string;
  dateEnd:      string;
}

function formatCurrencyDisplay(amount: string, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(amount));
}

function formatDateRange(start: string, end: string): string {
  const fmt = (s: string) =>
    new Date(s + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day:   "numeric",
      year:  "numeric",
      timeZone: "UTC",
    });
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

export default function BillingCard({
  customerCost,
  currency,
  dateStart,
  dateEnd,
}: BillingCardProps) {
  const formatted = formatCurrencyDisplay(customerCost, currency);
  const [dollars, cents] = formatted.split(".");

  return (
    <div
      className="animate-fade-up card-raised p-6 sm:p-8"
      style={{
        background:
          "linear-gradient(135deg, #f0f4ff 0%, #ffffff 60%, #fdf4ff 100%)",
        border: "1.5px solid #c7d2fe",
        animationDelay: "200ms",
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Talkyco Billing Cost
          </p>
          <div className="flex items-baseline gap-0.5">
            <span
              className="text-5xl font-extrabold tracking-tight text-num"
              style={{ color: "var(--accent)" }}
            >
              {dollars}
            </span>
            <span
              className="text-3xl font-bold text-num"
              style={{ color: "var(--accent)", opacity: 0.7 }}
            >
              .{cents}
            </span>
            <span
              className="ml-1.5 text-sm font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              {currency}
            </span>
          </div>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            Calculated from messaging usage for{" "}
            <span className="font-medium">{formatDateRange(dateStart, dateEnd)}</span>.
          </p>
        </div>

        {/* Visual accent */}
        <div
          className="hidden sm:flex items-center justify-center w-16 h-16 rounded-2xl flex-shrink-0"
          style={{ background: "var(--accent-light)" }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="5" width="20" height="14" rx="3" />
            <line x1="2" y1="10" x2="22" y2="10" />
            <line x1="6" y1="15" x2="10" y2="15" />
          </svg>
        </div>
      </div>
    </div>
  );
}
