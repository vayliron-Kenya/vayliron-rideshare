/**
 * Fare policy.
 *
 * Vayliron sells corporate shuttle seats on distance bands rather than a
 * per-kilometre rate: HR teams budget far more comfortably against five
 * predictable numbers than against a formula, and commuters can tell what a
 * leg costs before they book it. All amounts are whole shillings.
 */

export interface FareBand {
  /** Upper bound of the band, in kilometres travelled on the route. */
  maxKm: number;
  fareKes: number;
  label: string;
}

export const FARE_BANDS: readonly FareBand[] = [
  { maxKm: 8, fareKes: 150, label: "Zone A · up to 8 km" },
  { maxKm: 15, fareKes: 220, label: "Zone B · 8–15 km" },
  { maxKm: 25, fareKes: 300, label: "Zone C · 15–25 km" },
  { maxKm: 40, fareKes: 400, label: "Zone D · 25–40 km" },
  { maxKm: Infinity, fareKes: 500, label: "Zone E · over 40 km" },
];

export function bandForKm(km: number): FareBand {
  const distance = Math.max(0, km);
  // FARE_BANDS is ordered, and the last band is unbounded, so this always hits.
  return FARE_BANDS.find((b) => distance <= b.maxKm) ?? FARE_BANDS[FARE_BANDS.length - 1];
}

export function fareForKm(km: number): number {
  return bandForKm(km).fareKes;
}

export interface FareSplit {
  fareKes: number;
  employerKes: number;
  employeeKes: number;
  /** True when the employer's monthly ceiling absorbed part of its share. */
  capApplied: boolean;
}

export interface SplitOptions {
  fareKes: number;
  /** Employer's share of the fare in basis points (10000 = the whole fare). */
  subsidyBps: number;
  /** Per-employee monthly ceiling on employer spend. 0 means uncapped. */
  monthlyCapKes?: number;
  /** What the employer has already spent on this employee this month. */
  monthToDateKes?: number;
}

/**
 * Splits a fare between employer and employee.
 *
 * The employer's share is floored so the two halves always add back to the
 * exact fare — the bookings table enforces that as a CHECK constraint, and a
 * naive round() would break it on odd shillings.
 */
export function splitFare({
  fareKes,
  subsidyBps,
  monthlyCapKes = 0,
  monthToDateKes = 0,
}: SplitOptions): FareSplit {
  if (fareKes < 0) throw new RangeError("fareKes must not be negative");
  if (subsidyBps < 0 || subsidyBps > 10000) {
    throw new RangeError("subsidyBps must be between 0 and 10000");
  }

  let employer = Math.floor((fareKes * subsidyBps) / 10000);
  let capApplied = false;

  if (monthlyCapKes > 0) {
    const headroom = Math.max(0, monthlyCapKes - Math.max(0, monthToDateKes));
    if (employer > headroom) {
      employer = headroom;
      capApplied = true;
    }
  }

  return {
    fareKes,
    employerKes: employer,
    employeeKes: fareKes - employer,
    capApplied,
  };
}

// The symbol is written out rather than left to Intl's currency formatting,
// which renders KES as "KES" or "Ksh" depending on the ICU build.
const KES = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });

export function formatKes(amount: number): string {
  return `KSh ${KES.format(amount)}`;
}
