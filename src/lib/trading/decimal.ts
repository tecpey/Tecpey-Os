// Decimal.js wrapper for financial calculations
// Provides exact decimal arithmetic with configurable precision and rounding
// Designed for financial use cases requiring exact decimal representation

import Decimal from "decimal.js";

// Configure Decimal.js for financial use
Decimal.set({ precision: 30, rounding: Decimal.ROUND_DOWN });

// Wrapper function for creating Decimal instances
export function D(value: number | string): Decimal {
  return new Decimal(value);
}

// Addition
export function add(a: number | string, b: number | string): Decimal {
  return D(a).plus(D(b));
}

// Subtraction
export function sub(a: number | string, b: number | string): Decimal {
  return D(a).minus(D(b));
}

// Multiplication
export function mul(a: number | string, b: number | string): Decimal {
  return D(a).times(D(b));
}

// Division
export function div(a: number | string, b: number | string): Decimal {
  return D(a).div(D(b));
}

// Equality comparison
export function eq(a: number | string, b: number | string): boolean {
  return D(a).equals(D(b));
}

// Less than
export function lt(a: number | string, b: number | string): boolean {
  return D(a).lt(D(b));
}

// Greater than
export function gt(a: number | string, b: number | string): boolean {
  return D(a).gt(D(b));
}

// Less than or equal
export function lte(a: number | string, b: number | string): boolean {
  return D(a).lte(D(b));
}

// Greater than or equal
export function gte(a: number | string, b: number | string): boolean {
  return D(a).gte(D(b));
}

// Format to fixed decimal places (returns string)
export function toFixed(value: number | string, places: number): string {
  return D(value).toFixed(places);
}

// Convert to decimal places (returns Decimal)
export function toDP(value: number | string, places: number): Decimal {
  return D(value).toDecimalPlaces(places);
}

// Convert to number (use with caution - only for display)
export function toNumber(value: number | string): number {
  return D(value).toNumber();
}

// Convert to string
export function toString(value: number | string): string {
  return D(value).toString();
}