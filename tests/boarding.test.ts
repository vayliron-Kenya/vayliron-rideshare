import { describe, expect, it } from "vitest";

import {
  BusFullError,
  CROWDING_LABEL,
  crowding,
  generatePassCode,
  loadPct,
  nextFreePlace,
} from "@/lib/domain/boarding";

describe("taking a place on the bus", () => {
  it("starts at the front of the counter", () => {
    expect(nextFreePlace(49, [])).toBe(1);
  });

  it("takes the lowest place still free", () => {
    expect(nextFreePlace(49, [1, 2, 4])).toBe(3);
  });

  it("fills a gap left by a cancellation before extending", () => {
    expect(nextFreePlace(49, [2, 3])).toBe(1);
  });

  it("uses the last place rather than leaving it empty", () => {
    expect(nextFreePlace(3, [1, 2])).toBe(3);
  });

  it("refuses to oversell", () => {
    expect(() => nextFreePlace(3, [1, 2, 3])).toThrow(BusFullError);
  });

  it("ignores places above capacity when deciding the bus is full", () => {
    // A downsized bus can carry stale high place numbers; they are not free
    // places on the smaller unit, but they must not block the low ones either.
    expect(nextFreePlace(2, [1, 7])).toBe(2);
  });

  it("rejects a bus with no capacity at all", () => {
    expect(() => nextFreePlace(0, [])).toThrow(RangeError);
  });
});

describe("how full the bus looks to a rider", () => {
  it("reports an empty bus as empty", () => {
    expect(loadPct(49, 0)).toBe(0);
  });

  it("never exceeds full, even if the manifest overruns", () => {
    expect(loadPct(10, 12)).toBe(100);
  });

  it("does not divide by a capacity of zero", () => {
    expect(loadPct(0, 5)).toBe(0);
  });

  it("describes crowding in words a rider can act on", () => {
    expect(crowding(49, 0)).toBe("quiet");
    expect(crowding(49, 30)).toBe("filling");
    expect(crowding(49, 45)).toBe("busy");
    expect(crowding(49, 49)).toBe("full");
  });

  it("calls a bus full the moment the last place goes, not at a percentage", () => {
    // 48 of 49 is 98% — busy by the numbers, but there is still a place.
    expect(crowding(49, 48)).toBe("busy");
    expect(crowding(4, 4)).toBe("full");
  });

  it("has a plain-language label for every state", () => {
    for (const state of ["quiet", "filling", "busy", "full"] as const) {
      expect(CROWDING_LABEL[state]).toBeTruthy();
    }
  });
});

describe("boarding pass codes", () => {
  it("is six characters long", () => {
    expect(generatePassCode()).toHaveLength(6);
  });

  it("leaves out the characters people mishear or misread", () => {
    let seen = "";
    for (let i = 0; i < 400; i += 1) seen += generatePassCode();
    expect(seen).not.toMatch(/[AEIOU01]/);
  });

  it("is deterministic when the randomness is", () => {
    const fixed = () => 0;
    expect(generatePassCode(fixed)).toBe("222222");
  });

  it("spreads across the whole alphabet", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generatePassCode()));
    expect(codes.size).toBeGreaterThan(190);
  });
});
