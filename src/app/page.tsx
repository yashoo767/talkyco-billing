"use client";

import { useState, useRef } from "react";
import LookupForm   from "@/components/LookupForm";
import UsageResults from "@/components/UsageResults";
import type { PublicUsageSummary } from "@/types";

export default function HomePage() {
  const [result,    setResult]    = useState<PublicUsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  function handleResult(data: PublicUsageSummary) {
    setResult(data);
    // Smooth scroll to results on mobile
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  return (
    <>
      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <header className="hero relative z-0">
        <div className="relative z-10 max-w-5xl mx-auto px-5 py-16 sm:py-20 md:py-24">
          {/* Logo / brand */}
          <div className="mb-8 flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <rect x="2" y="5" width="20" height="14" rx="3"/>
                <line x1="2" y1="10" x2="22" y2="10"/>
                <line x1="6" y1="15" x2="10" y2="15"/>
              </svg>
            </div>
            <span className="text-white font-semibold text-sm tracking-wide">
              Talkyco Billing
            </span>
          </div>

          {/* Headline */}
          <div className="max-w-2xl">
            <h1 className="text-display text-white mb-4">
              Check your{" "}
              <span style={{ color: "#a5b4fc" }}>messaging usage</span>
            </h1>
            <p
              className="text-lg sm:text-xl leading-relaxed mb-10"
              style={{ color: "rgba(255,255,255,0.65)" }}
            >
              Enter a phone number and instantly view messaging activity
              and billing for your selected period.
            </p>
          </div>

          {/* Lookup form card — floats over the hero */}
          <div
            className="card-raised p-5 sm:p-6 max-w-md"
            style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
          >
            <LookupForm
              onResult={handleResult}
              onLoading={setIsLoading}
              isLoading={isLoading}
            />
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ──────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-5 py-10 sm:py-14">
        {/* Results */}
        {result && !isLoading && (
          <div ref={resultsRef}>
            <UsageResults data={result} />
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-5 animate-fade-in">
            <div className="shimmer h-8 w-48 rounded-lg" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="card p-5 space-y-3">
                  <div className="shimmer h-3 w-16 rounded" />
                  <div className="shimmer h-8 w-24 rounded" />
                </div>
              ))}
            </div>
            <div className="card p-6 sm:p-8 space-y-4">
              <div className="shimmer h-4 w-32 rounded" />
              <div className="shimmer h-12 w-40 rounded" />
            </div>
            <div className="card p-5 space-y-3">
              <div className="shimmer h-4 w-24 rounded" />
              <div className="shimmer h-40 w-full rounded" />
            </div>
          </div>
        )}

        {/* Empty / first-load hint */}
        {!result && !isLoading && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--accent-light)" }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.75"
              >
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
            <div>
              <p
                className="font-semibold text-lg mb-1"
                style={{ color: "var(--text)" }}
              >
                Enter a phone number to get started
              </p>
              <p
                className="text-sm max-w-sm"
                style={{ color: "var(--text-muted)" }}
              >
                View outbound and inbound message counts, billable segments,
                and your total cost for any period.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer
        className="border-t mt-auto"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="max-w-5xl mx-auto px-5 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          <span>© {new Date().getFullYear()} Talkyco Billing</span>
          <span>Messaging usage information only. Message-level costs may vary.</span>
        </div>
      </footer>
    </>
  );
}
