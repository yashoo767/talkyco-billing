"use client";

interface MetricCardProps {
  label:    string;
  value:    string | number;
  subLabel?: string;
  mono?:    boolean;
  accent?:  boolean;
  delay?:   number;
}

export default function MetricCard({
  label,
  value,
  subLabel,
  mono = true,
  accent = false,
  delay = 0,
}: MetricCardProps) {
  const displayValue =
    typeof value === "number" ? value.toLocaleString("en-US") : value;

  return (
    <div
      className="animate-fade-up card p-5 flex flex-col gap-1.5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span
        style={{ color: "var(--text-muted)" }}
        className="text-xs font-semibold uppercase tracking-wider"
      >
        {label}
      </span>
      <span
        className={`text-3xl font-bold leading-none tracking-tight ${mono ? "text-num" : ""}`}
        style={{ color: accent ? "var(--accent)" : "var(--text)" }}
      >
        {displayValue}
      </span>
      {subLabel && (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {subLabel}
        </span>
      )}
    </div>
  );
}
