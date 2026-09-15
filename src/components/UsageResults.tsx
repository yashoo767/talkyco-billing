"use client";

import MetricCard    from "./MetricCard";
import BillingCard   from "./BillingCard";
import UsageChart    from "./UsageChart";
import DailyBreakdown from "./DailyBreakdown";
import type { PublicUsageSummary } from "@/types";

interface UsageResultsProps {
  data: PublicUsageSummary;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-US", {
    month:    "long",
    day:      "numeric",
    year:     "numeric",
    timeZone: "UTC",
  });
}

function exportCsv(data: PublicUsageSummary) {
  const headers = ["Date", "Outbound", "Inbound", "Total", "Segments", `Cost (${data.currency})`];
  const rows    = data.daily.map((d) => [
    d.date,
    d.outbound,
    d.inbound,
    d.total,
    d.segments,
    d.customerCost,
  ]);

  const csvContent = [headers, ...rows]
    .map((r) => r.map((c) => `"${c}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = `talkyco-billing-${data.phoneNumber.replace(/\D/g, "")}-${data.dateStart}-${data.dateEnd}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function UsageResults({ data }: UsageResultsProps) {
  const isSameDay = data.dateStart === data.dateEnd;
  const dateLabel = isSameDay
    ? fmtDate(data.dateStart)
    : `${fmtDate(data.dateStart)} – ${fmtDate(data.dateEnd)}`;

  return (
    <div className="space-y-5">
      {/* Period header */}
      <div className="animate-fade-up" style={{ animationDelay: "0ms" }}>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <p
              className="text-sm font-medium mb-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              Phone Number
            </p>
            <p
              className="text-xl font-bold tracking-tight text-num"
              style={{ color: "var(--text)" }}
            >
              {data.phoneNumber}
            </p>
          </div>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {dateLabel}
          </p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Total Messages"
          value={data.total}
          delay={0}
        />
        <MetricCard
          label="Outbound"
          value={data.outbound}
          delay={50}
        />
        <MetricCard
          label="Inbound"
          value={data.inbound}
          delay={100}
        />
        <MetricCard
          label="Billable Segments"
          value={data.segments}
          delay={150}
        />
      </div>

      {/* Billing card */}
      <BillingCard
        customerCost={data.customerCost}
        currency={data.currency}
        dateStart={data.dateStart}
        dateEnd={data.dateEnd}
      />

      {/* Chart */}
      {data.daily.length > 1 && <UsageChart daily={data.daily} />}

      {/* Daily breakdown */}
      <DailyBreakdown
        daily={data.daily}
        currency={data.currency}
        onExportCsv={() => exportCsv(data)}
      />

      {/* Data freshness */}
      <p
        className="text-xs text-center animate-fade-in"
        style={{ color: "var(--text-muted)", animationDelay: "500ms" }}
      >
        {data.dataSource === "cached" ? "From cache · " : ""}
        Data as of{" "}
        {new Date(data.cachedAt).toLocaleTimeString("en-US", {
          hour:   "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}
