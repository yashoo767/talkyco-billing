/**
 * Talkyco Billing — Pricing calculations
 *
 * All monetary arithmetic uses Decimal.js to avoid IEEE-754 floating-point
 * rounding errors that are unacceptable for financial figures.
 *
 * Strategy:
 *   1. Store actual_cost as a DECIMAL-STRING in the DB ("0.0075"), never float.
 *   2. Load with new Decimal(actualCostString) — exact representation.
 *   3. Multiply by MARKUP_MULTIPLIER using Decimal arithmetic.
 *   4. Round to 2 dp with ROUND_HALF_UP (the standard accounting rule).
 *   5. Serialise back to string for the API response.
 *
 * Why 1.30 multiplier rather than 30% margin?
 *   A 30% MARKUP on cost means:  customer_cost = actual_cost × 1.30
 *   A 30% MARGIN would mean:     customer_cost = actual_cost / 0.70  (≈42.8% markup)
 *   These requirements specify markup, so we use × 1.30.
 */

import Decimal from "decimal.js";

// Configure Decimal for financial work
Decimal.set({
  precision: 28,        // plenty for any realistic cost figure
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 28,
});

const MARKUP_MULTIPLIER = new Decimal("1.30");

/**
 * Convert an actual cost (as a decimal string or number) to the
 * customer-facing price with a 30% markup, rounded to 2 decimal places.
 *
 * @example
 *   applyMarkup("10.00")  → "13.00"
 *   applyMarkup("42.67")  → "55.47"
 */
export function applyMarkup(actualCost: string | number): string {
  const actual = new Decimal(actualCost.toString());
  const customer = actual.mul(MARKUP_MULTIPLIER);
  return customer.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/**
 * Sum an array of actual cost strings and return the customer cost (× 1.30).
 * Summation is done entirely in Decimal to avoid accumulated float error.
 */
export function sumAndMarkup(actualCosts: string[]): string {
  const total = actualCosts.reduce(
    (acc, v) => acc.plus(new Decimal(v)),
    new Decimal("0")
  );
  return applyMarkup(total.toString());
}

/**
 * Format a cost string as a currency string for display.
 *
 * @example
 *   formatCurrency("55.47", "USD")  → "$55.47"
 */
export function formatCurrency(amount: string, currency = "USD"): string {
  const num = parseFloat(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Compute gross margin (customer_cost − actual_cost) as a string.
 * Internal use only — never send to public API.
 */
export function grossMargin(actualCost: string): string {
  const actual   = new Decimal(actualCost);
  const customer = actual.mul(MARKUP_MULTIPLIER);
  const margin   = customer.minus(actual);
  return margin.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
