"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  TooltipProps,
} from "recharts";
import type { PublicDailyUsage } from "@/types";

type ChartMode = "messages" | "segments" | "cost";

interface UsageChartProps {
  daily: PublicDailyUsage[];
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day:   "numeric",
    timeZone: "UTC",
  });
}

function fmtCurrency(val: string | number): string {
  const num = typeof val === "string" ? parseFloat(val) : val;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(num);
}

function CustomTooltip({
  active,
  payload,
  label,
  mode,
}: TooltipProps<number, string> & { mode: ChartMode }) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload as PublicDailyUsage;
  if (!row) return null;

  return (
    <div
      className="card p-3 text-sm min-w-[160px]"
      style={{ boxShadow: "var(--shadow-card-lg)" }}
    >
      <p className="font-semibold mb-2" style={{ color: "var(--text)" }}>
        {fmtDate(row.date)}
      </p>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between gap-4">
          <span style={{ color: "var(--text-muted)" }}>Total</span>
          <span className="text-num font-medium">{row.total.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span style={{ color: "var(--text-muted)" }}>Outbound</span>
          <span className="text-num font-medium">{row.outbound.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span style={{ color: "var(--text-muted)" }}>Inbound</span>
          <span className="text-num font-medium">{row.inbound.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span style={{ color: "var(--text-muted)" }}>Segments</span>
          <span className="text-num font-medium">{row.segments.toLocaleString()}</span>
        </div>
        <div
          className="flex justify-between gap-4 pt-1 mt-1"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span style={{ color: "var(--text-muted)" }}>Cost</span>
          <span
            className="text-num font-semibold"
            style={{ color: "var(--accent)" }}
          >
            {fmtCurrency(row.customerCost)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function UsageChart({ daily }: UsageChartProps) {
  const [mode, setMode] = useState<ChartMode>("messages");

  const modes: { key: ChartMode; label: string }[] = [
    { key: "messages", label: "Messages" },
    { key: "segments", label: "Segments" },
    { key: "cost",     label: "Cost" },
  ];

  const dataKey = {
    messages: "total",
    segments: "segments",
    cost:     "customerCost",
  }[mode];

  // Recharts needs numeric values for cost
  const chartData = daily.map((d) => ({
    ...d,
    customerCost: parseFloat(d.customerCost),
  }));

  const tickFormatter =
    mode === "cost"
      ? (v: number) => `$${v.toFixed(2)}`
      : (v: number) => v.toLocaleString();

  return (
    <div className="animate-fade-up card p-5 sm:p-6" style={{ animationDelay: "300ms" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h3 className="font-semibold" style={{ color: "var(--text)" }}>
          Daily Usage
        </h3>

        {/* Mode selector */}
        <div
          className="flex rounded-lg p-0.5 gap-0.5"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
        >
          {modes.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className="px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150"
              style={
                mode === m.key
                  ? {
                      background: "var(--surface)",
                      color: "var(--accent)",
                      boxShadow: "var(--shadow-card)",
                    }
                  : { color: "var(--text-secondary)" }
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="colorGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              tickFormatter={fmtDate}
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              tickFormatter={tickFormatter}
            />
            <Tooltip
              content={<CustomTooltip mode={mode} />}
              cursor={{ stroke: "var(--accent)", strokeWidth: 1, strokeDasharray: "4 2" }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#colorGrad)"
              dot={false}
              activeDot={{ r: 4, fill: "#6366f1", stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
