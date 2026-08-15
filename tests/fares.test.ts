import { describe, expect, it } from "vitest";

import { bandForKm, fareForKm, FARE_BANDS, formatKes, splitFare } from "@/lib/domain/fares";

describe("fare bands", () => {
  it("prices each band at its own rate", () => {
    expect(fareForKm(0)).toBe(150);
    expect(fareForKm(7.9)).toBe(150);
    expect(fareForKm(8)).toBe(150);
    expect(fareForKm(8.1)).toBe(220);
    expect(fareForKm(15)).toBe(220);
    expect(fareForKm(15.1)).toBe(300);
    expect(fareForKm(25)).toBe(300);
    expect(fareForKm(25.1)).toBe(400);
    expect(fareForKm(40)).toBe(400);
    expect(fareForKm(40.1)).toBe(500);
  });

  it("keeps bands ordered and open-ended at the top", () => {
    const maxima = FARE_BANDS.map((b) => b.maxKm);
    expect([...maxima].sort((a, b) => a - b)).toEqual(maxima);
    expect(maxima[maxima.length - 1]).toBe(Infinity);
    expect(bandForKm(1000).fareKes).toBe(500);
  });

  it("treats a negative distance as zero rather than throwing", () => {
    expect(fareForKm(-4)).toBe(150);
  });
});

describe("splitting a fare between employer and employee", () => {
  it("gives the whole fare to a fully subsidising employer", () => {
    const split = splitFare({ fareKes: 300, subsidyBps: 10000 });
    expect(split).toMatchObject({ employerKes: 300, employeeKes: 0, capApplied: false });
  });

  it("leaves the whole fare with the rider when there is no subsidy", () => {
    const split = splitFare({ fareKes: 300, subsidyBps: 0 });
    expect(split).toMatchObject({ employerKes: 0, employeeKes: 300 });
  });

  it("floors the employer share so the halves always reconstruct the fare", () => {
    // 220 * 75% = 165 exactly; 150 * 75% = 112.5, which must not round up.
    expect(splitFare({ fareKes: 220, subsidyBps: 7500 }).employerKes).toBe(165);
    expect(splitFare({ fareKes: 150, subsidyBps: 7500 })).toMatchObject({
      employerKes: 112,
      employeeKes: 38,
    });
  });

  it("never lets the two shares drift from the fare, at any percentage", () => {
    for (let fare = 0; fare <= 500; fare += 7) {
      for (let bps = 0; bps <= 10000; bps += 137) {
        const split = splitFare({ fareKes: fare, subsidyBps: bps });
        expect(split.employerKes + split.employeeKes).toBe(fare);
        expect(split.employerKes).toBeGreaterThanOrEqual(0);
        expect(split.employeeKes).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("charges the rider the balance once the monthly cap is used up", () => {
    const split = splitFare({
      fareKes: 300,
      subsidyBps: 10000,
      monthlyCapKes: 4500,
      monthToDateKes: 4400,
    });
    expect(split).toMatchObject({ employerKes: 100, employeeKes: 200, capApplied: true });
  });

  it("charges the rider the whole fare once the cap is exhausted", () => {
    const split = splitFare({
      fareKes: 300,
      subsidyBps: 10000,
      monthlyCapKes: 4500,
      monthToDateKes: 5000,
    });
    expect(split).toMatchObject({ employerKes: 0, employeeKes: 300, capApplied: true });
  });

  it("treats a zero cap as uncapped", () => {
    const split = splitFare({
      fareKes: 400,
      subsidyBps: 10000,
      monthlyCapKes: 0,
      monthToDateKes: 999999,
    });
    expect(split).toMatchObject({ employerKes: 400, capApplied: false });
  });

  it("rejects impossible inputs", () => {
    expect(() => splitFare({ fareKes: -1, subsidyBps: 5000 })).toThrow(RangeError);
    expect(() => splitFare({ fareKes: 100, subsidyBps: 10001 })).toThrow(RangeError);
    expect(() => splitFare({ fareKes: 100, subsidyBps: -1 })).toThrow(RangeError);
  });
});

describe("formatting", () => {
  it("renders shillings the way Kenyan riders read them", () => {
    expect(formatKes(1500)).toContain("1,500");
    expect(formatKes(1500)).toContain("KSh");
    expect(formatKes(0)).toContain("0");
  });
});
