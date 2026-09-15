"use client";

import { useState } from "react";
import type { PublicDailyUsage } from "@/types";

interface DailyBreakdownProps {
  daily:    PublicDailyUsage[];
  currency: string;
  onExportCsv: () => void;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-US", {
    month:    "short",
    day:      "2-digit",
    timeZone: "UTC",
  });
}

function fmtCurrency(val: string, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style:                "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(parseFloat(val));
}

export default function DailyBreakdown({
  daily,
  currency,
  onExportCsv,
}: DailyBreakdownProps) {
  const [showAll, setShowAll] = useState(false);
  const INITIAL_ROWS = 10;

  // Only show rows with any activity by default
  const activeRows = daily.filter(
    (d) => d.total > 0 || parseFloat(d.customerCost) > 0
  );
  const rows      = activeRows.length > 0 ? activeRows : daily;
  const displayed = showAll ? rows : rows.slice(0, INITIAL_ROWS);

  return (
    <div className="animate-fade-up card" style={{ animationDelay: "400ms" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h3 className="font-semibold" style={{ color: "var(--text)" }}>
          Daily Breakdown
        </h3>
        <button
          onClick={onExportCsv}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          style={{
            color:      "var(--accent)",
            background: "var(--accent-light)",
            border:     "1px solid #c7d2fe",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Outbound</th>
              <th>Inbound</th>
              <th>Total</th>
              <th>Segments</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((row, i) => (
              <tr key={row.date}>
                <td className="font-medium" style={{ color: "var(--text)" }}>
                  {fmtDate(row.date)}
                </td>
                <td className="text-num" style={{ color: "var(--text-secondary)" }}>
                  {row.outbound.toLocaleString()}
                </td>
                <td className="text-num" style={{ color: "var(--text-secondary)" }}>
                  {row.inbound.toLocaleString()}
                </td>
                <td className="text-num font-medium">{row.total.toLocaleString()}</td>
                <td className="text-num" style={{ color: "var(--text-secondary)" }}>
                  {row.segments.toLocaleString()}
                </td>
                <td
                  className="text-num font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  {fmtCurrency(row.customerCost, row.currency || currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Show more / less */}
      {rows.length > INITIAL_ROWS && (
        <div
          className="px-5 py-3 flex justify-center"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-sm font-medium transition-colors"
            style={{ color: "var(--accent)" }}
          >
            {showAll
              ? "Show less"
              : `Show all ${rows.length} days`}
          </button>
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="py-12 text-center" style={{ color: "var(--text-muted)" }}>
          No messaging activity found for this period.
        </div>
      )}
    </div>
  );
}
