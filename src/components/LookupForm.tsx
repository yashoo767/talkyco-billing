"use client";

import { useState, useCallback } from "react";
import type { PublicUsageSummary } from "@/types";

interface LookupFormProps {
  onResult: (data: PublicUsageSummary) => void;
  onLoading: (loading: boolean) => void;
  isLoading: boolean;
}

type Preset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "custom";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today",     label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7",     label: "Last 7 Days" },
  { value: "last30",    label: "Last 30 Days" },
  { value: "thisMonth", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
  { value: "custom",    label: "Custom Range" },
];

export default function LookupForm({ onResult, onLoading, isLoading }: LookupFormProps) {
  const [phone,       setPhone]       = useState("");
  const [preset,      setPreset]      = useState<Preset>("thisMonth");
  const [customStart, setCustomStart] = useState("");
  const [customEnd,   setCustomEnd]   = useState("");
  const [error,       setError]       = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!phone.trim()) {
        setError("Please enter a phone number.");
        return;
      }

      onLoading(true);
      try {
        const res = await fetch("/api/lookup", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            phoneNumber: phone.trim(),
            preset,
            ...(preset === "custom"
              ? { dateStart: customStart, dateEnd: customEnd }
              : {}),
          }),
        });

        const json = await res.json();

        if (!res.ok) {
          setError(json.error ?? "Unable to retrieve usage data. Please try again.");
          return;
        }

        onResult(json as PublicUsageSummary);
      } catch {
        setError("Unable to retrieve usage data. Please check your connection and try again.");
      } finally {
        onLoading(false);
      }
    },
    [phone, preset, customStart, customEnd, onResult, onLoading]
  );

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-3">
        {/* Phone number input */}
        <div className="relative">
          <div
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.1 1.23 2 2 0 012.08.01h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
          </div>
          <input
            type="tel"
            className="input-field pl-10"
            placeholder="+1 415 555 1234"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setError(null); }}
            disabled={isLoading}
            autoComplete="tel"
            inputMode="tel"
          />
        </div>

        {/* Date range selector */}
        <select
          className="select-field"
          value={preset}
          onChange={(e) => setPreset(e.target.value as Preset)}
          disabled={isLoading}
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        {/* Custom date range */}
        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-2 animate-slide-down">
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Start Date
              </label>
              <input
                type="date"
                className="input-field text-sm"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                disabled={isLoading}
                max={customEnd || undefined}
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                End Date
              </label>
              <input
                type="date"
                className="input-field text-sm"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                disabled={isLoading}
                min={customStart || undefined}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm animate-fade-in"
            style={{
              background: "var(--error-bg)",
              color:      "var(--error)",
              border:     "1px solid #fecaca",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          className="btn-primary w-full py-3 text-base"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <svg
                className="animate-spin"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2" strokeLinecap="round"/>
              </svg>
              Checking Usage...
            </>
          ) : (
            <>
              Check Usage
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
