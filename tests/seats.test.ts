import { describe, expect, it } from "vitest";

import {
  allSeats,
  generatePassCode,
  isSeatAvailable,
  nextFreeSeat,
  seatMap,
  TripFullError,
} from "@/lib/domain/seats";

describe("seat map", () => {
  it("lays a coach out 2 + aisle + 2", () => {
    const rows = seatMap(49);
    expect(rows[0].left.map((s) => s.seatNo)).toEqual([1, 2]);
    expect(rows[0].right.map((s) => s.seatNo)).toEqual([3, 4]);
    expect(rows[0].left.map((s) => s.column)).toEqual(["A", "B"]);
    expect(rows[0].right.map((s) => s.column)).toEqual(["C", "D"]);
  });

  it("puts windows on the outside columns", () => {
    const seats = allSeats(26);
    expect(seats.filter((s) => s.kind === "window").map((s) => s.column)).toEqual(
      expect.arrayContaining(["A", "D"]),
    );
    expect(seats.every((s) => (s.column === "B" || s.column === "C") === (s.kind === "aisle"))).toBe(
      true,
    );
  });

  it("numbers exactly as many seats as the bus has", () => {
    for (const capacity of [26, 33, 37, 45, 49]) {
      const seats = allSeats(capacity);
      expect(seats).toHaveLength(capacity);
      expect(seats.map((s) => s.seatNo)).toEqual(
        Array.from({ length: capacity }, (_, i) => i + 1),
      );
    }
  });

  it("handles a final part-row without inventing seats", () => {
    const rows = seatMap(6);
    expect(rows).toHaveLength(2);
    expect(rows[1].left.map((s) => s.seatNo)).toEqual([5, 6]);
    expect(rows[1].right).toEqual([]);
  });

  it("rejects a bus with no seats", () => {
    expect(() => seatMap(0)).toThrow(RangeError);
    expect(() => seatMap(-4)).toThrow(RangeError);
  });
});

describe("allocating a seat", () => {
  it("gives out the lowest free seat", () => {
    expect(nextFreeSeat(33, [])).toBe(1);
    expect(nextFreeSeat(33, [1, 2, 3])).toBe(4);
  });

  it("reuses a gap left by a cancellation", () => {
    expect(nextFreeSeat(33, [1, 3, 4])).toBe(2);
  });

  it("throws once the bus is full", () => {
    const full = Array.from({ length: 26 }, (_, i) => i + 1);
    expect(() => nextFreeSeat(26, full)).toThrow(TripFullError);
  });

  it("knows which seats can still be picked", () => {
    expect(isSeatAvailable(33, [5], 6)).toBe(true);
    expect(isSeatAvailable(33, [5], 5)).toBe(false);
    expect(isSeatAvailable(33, [], 34)).toBe(false);
    expect(isSeatAvailable(33, [], 0)).toBe(false);
    expect(isSeatAvailable(33, [], 2.5)).toBe(false);
  });
});

describe("boarding pass codes", () => {
  it("is six characters with nothing ambiguous to read aloud", () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generatePassCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[2-9BCDFGHJKLMNPQRSTVWXYZ]{6}$/);
      expect(code).not.toMatch(/[AEIOU01]/);
    }
  });

  it("is deterministic for a given random source", () => {
    const fixed = () => 0;
    expect(generatePassCode(fixed)).toBe("222222");
  });
});
