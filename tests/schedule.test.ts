import { describe, expect, it } from "vitest";

import {
  buildTimetable,
  formatHhmm,
  isServiceDay,
  legKm,
  nextServiceDate,
  orderedStops,
  parseHhmm,
  peakFactor,
  SATURDAY_TIMETABLE,
  TIMETABLE,
  timetableFor,
  tripDurationMinutes,
} from "@/lib/domain/schedule";
import type { RouteStop } from "@/lib/types";

const stop = (
  id: string,
  seq: number,
  kmFromStart: number,
  minFromStart: number,
): RouteStop => ({
  id,
  name: id,
  slug: id,
  area: "Nairobi",
  landmark: `${id} stage`,
  lat: -1.28 + seq * 0.01,
  lng: 36.82 + seq * 0.01,
  seq,
  kmFromStart,
  minFromStart,
});

// A miniature Thika Road: 3 stages over 20 km / 24 free-flow minutes.
const LINE: RouteStop[] = [
  stop("juja", 0, 0, 0),
  stop("roysambu", 1, 12.5, 14),
  stop("cbd", 2, 20, 24),
];

describe("clock helpers", () => {
  it("round-trips HH:MM", () => {
    expect(parseHhmm("06:30")).toBe(390);
    expect(formatHhmm(390)).toBe("06:30");
    expect(formatHhmm(0)).toBe("00:00");
  });

  it("wraps past midnight instead of producing a 25th hour", () => {
    expect(formatHhmm(1440)).toBe("00:00");
    expect(formatHhmm(1500)).toBe("01:00");
    expect(formatHhmm(-60)).toBe("23:00");
  });

  it("rejects malformed times", () => {
    expect(() => parseHhmm("6:30")).toThrow(RangeError);
    expect(() => parseHhmm("25:00")).toThrow(RangeError);
    expect(() => parseHhmm("06:61")).toThrow(RangeError);
  });
});

describe("peak factors", () => {
  it("penalises the morning and evening rush hardest", () => {
    expect(peakFactor("05:30")).toBeLessThan(peakFactor("06:00"));
    expect(peakFactor("06:00")).toBeLessThan(peakFactor("07:00"));
    expect(peakFactor("07:00")).toBeLessThan(peakFactor("08:00"));
    expect(peakFactor("17:30")).toBeGreaterThan(peakFactor("16:30"));
    expect(peakFactor("19:00")).toBeLessThan(peakFactor("18:00"));
  });

  it("never runs faster than free-flow", () => {
    for (let minutes = 0; minutes < 1440; minutes += 5) {
      expect(peakFactor(formatHhmm(minutes))).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps the middle of the day quiet", () => {
    expect(peakFactor("11:00")).toBe(1.1);
    expect(peakFactor("22:00")).toBe(1.1);
  });
});

describe("direction handling", () => {
  it("leaves the inbound order untouched", () => {
    expect(orderedStops(LINE, "inbound").map((s) => s.id)).toEqual([
      "juja",
      "roysambu",
      "cbd",
    ]);
  });

  it("reverses the line and rebases distances on the new origin", () => {
    const outbound = orderedStops(LINE, "outbound");
    expect(outbound.map((s) => s.id)).toEqual(["cbd", "roysambu", "juja"]);
    expect(outbound.map((s) => s.seq)).toEqual([0, 1, 2]);
    expect(outbound.map((s) => s.kmFromStart)).toEqual([0, 7.5, 20]);
    expect(outbound.map((s) => s.minFromStart)).toEqual([0, 10, 24]);
  });

  it("measures the same leg identically in both directions", () => {
    const inbound = orderedStops(LINE, "inbound");
    const outbound = orderedStops(LINE, "outbound");
    expect(legKm(inbound, "juja", "roysambu")).toBe(legKm(outbound, "roysambu", "juja"));
  });
});

describe("timetables", () => {
  it("stretches free-flow minutes by the peak factor", () => {
    const timetable = buildTimetable(LINE, "07:00");
    expect(peakFactor("07:00")).toBe(1.6);
    expect(timetable.map((e) => e.adjustedMin)).toEqual([0, 22, 38]);
    expect(timetable.map((e) => e.time)).toEqual(["07:00", "07:22", "07:38"]);
  });

  it("makes the same run quicker off-peak", () => {
    expect(tripDurationMinutes(LINE, "07:00")).toBeGreaterThan(
      tripDurationMinutes(LINE, "11:00"),
    );
  });

  it("always leaves the first stage exactly on time", () => {
    for (const departure of [...TIMETABLE.inbound, ...TIMETABLE.outbound]) {
      expect(buildTimetable(LINE, departure)[0].time).toBe(departure);
    }
  });

  it("never has a stop arriving before the one ahead of it", () => {
    const timetable = buildTimetable(LINE, "06:30");
    for (let i = 1; i < timetable.length; i += 1) {
      expect(timetable[i].adjustedMin).toBeGreaterThanOrEqual(timetable[i - 1].adjustedMin);
    }
  });
});

describe("legs", () => {
  it("charges only the distance actually travelled", () => {
    expect(legKm(LINE, "juja", "roysambu")).toBe(12.5);
    expect(legKm(LINE, "roysambu", "cbd")).toBe(7.5);
    expect(legKm(LINE, "juja", "cbd")).toBe(20);
  });

  it("refuses a leg that runs against the direction of travel", () => {
    expect(() => legKm(LINE, "cbd", "juja")).toThrow(/before the boarding stop/);
  });

  it("refuses stops that are not on the line, and zero-length legs", () => {
    expect(() => legKm(LINE, "westlands", "cbd")).toThrow(/not on this route/);
    expect(() => legKm(LINE, "juja", "westlands")).toThrow(/not on this route/);
    expect(() => legKm(LINE, "juja", "juja")).toThrow(/must differ/);
  });
});

describe("service calendar", () => {
  // 2026-08-15 is a Saturday, 2026-08-16 a Sunday, 2026-08-17 a Monday.
  it("runs Monday to Saturday and rests on Sunday", () => {
    expect(isServiceDay("2026-08-14")).toBe(true);
    expect(isServiceDay("2026-08-15")).toBe(true);
    expect(isServiceDay("2026-08-16")).toBe(false);
    expect(isServiceDay("2026-08-17")).toBe(true);
  });

  it("thins the timetable on Saturdays and empties it on Sundays", () => {
    expect(timetableFor("2026-08-14", "inbound")).toEqual(TIMETABLE.inbound);
    expect(timetableFor("2026-08-15", "inbound")).toEqual(SATURDAY_TIMETABLE.inbound);
    expect(timetableFor("2026-08-16", "inbound")).toEqual([]);
  });

  it("rolls a Sunday forward to the Monday", () => {
    expect(nextServiceDate("2026-08-16")).toBe("2026-08-17");
    expect(nextServiceDate("2026-08-15")).toBe("2026-08-15");
  });
});
