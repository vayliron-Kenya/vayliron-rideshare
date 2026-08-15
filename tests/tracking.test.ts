import { describe, expect, it } from "vitest";

import { haversineKm, interpolate } from "@/lib/domain/geo";
import { buildTimetable } from "@/lib/domain/schedule";
import { nairobiInstant } from "@/lib/domain/time";
import { etaForStop, trackTrip } from "@/lib/domain/tracking";
import type { RouteStop } from "@/lib/types";

const LINE: RouteStop[] = [
  { id: "ruaka", name: "Ruaka", slug: "ruaka", area: "Kiambu Road", landmark: "Ruaka Stage", lat: -1.2033, lng: 36.7793, seq: 0, kmFromStart: 0, minFromStart: 0 },
  { id: "gigiri", name: "Gigiri", slug: "gigiri", area: "Gigiri", landmark: "UN Avenue", lat: -1.2333, lng: 36.8127, seq: 1, kmFromStart: 8.1, minFromStart: 20 },
  { id: "westlands", name: "Westlands", slug: "westlands", area: "Westlands", landmark: "Sarit", lat: -1.2635, lng: 36.8032, seq: 2, kmFromStart: 12.6, minFromStart: 40 },
];

// Off-peak, so the peak factor is 1.1 and the run takes 0 / 22 / 44 minutes.
const TIMETABLE = buildTimetable(LINE, "11:00");
const DEPARTS = nairobiInstant("2026-08-17", "11:00");
const at = (minutes: number) => new Date(DEPARTS.getTime() + minutes * 60000);

describe("tracking a departure", () => {
  it("waits at the first stage before departure", () => {
    const position = trackTrip(TIMETABLE, DEPARTS, at(-10));
    expect(position.state).toBe("not_departed");
    expect(position.progress).toBe(0);
    expect(position.etaMinutes).toBeCloseTo(10);
    expect(position.position).toEqual({ lat: LINE[0].lat, lng: LINE[0].lng });
    expect(position.nextStop?.id).toBe("ruaka");
  });

  it("sits between the bracketing stages while running", () => {
    const position = trackTrip(TIMETABLE, DEPARTS, at(11));
    expect(position.state).toBe("en_route");
    expect(position.lastStop?.id).toBe("ruaka");
    expect(position.nextStop?.id).toBe("gigiri");
    expect(position.etaMinutes).toBeCloseTo(11);

    // Halfway through the first leg in time is halfway along it in space.
    const midpoint = interpolate(LINE[0], LINE[1], 0.5);
    expect(position.position.lat).toBeCloseTo(midpoint.lat, 4);
    expect(position.position.lng).toBeCloseTo(midpoint.lng, 4);
  });

  it("lands exactly on a stage at its scheduled minute", () => {
    const position = trackTrip(TIMETABLE, DEPARTS, at(22));
    expect(position.lastStop?.id).toBe("gigiri");
    expect(position.position.lat).toBeCloseTo(LINE[1].lat, 5);
    expect(position.position.lng).toBeCloseTo(LINE[1].lng, 5);
  });

  it("parks at the terminus once the run is over", () => {
    const position = trackTrip(TIMETABLE, DEPARTS, at(500));
    expect(position.state).toBe("arrived");
    expect(position.progress).toBe(1);
    expect(position.nextStop).toBeNull();
    expect(position.speedKph).toBe(0);
    expect(position.position).toEqual({ lat: LINE[2].lat, lng: LINE[2].lng });
  });

  it("advances monotonically down the line", () => {
    let previous = -1;
    for (let minute = 0; minute <= 44; minute += 1) {
      const progress = trackTrip(TIMETABLE, DEPARTS, at(minute)).progress;
      expect(progress).toBeGreaterThanOrEqual(previous);
      previous = progress;
    }
  });

  it("reports a plausible road speed", () => {
    const position = trackTrip(TIMETABLE, DEPARTS, at(11));
    expect(position.speedKph).toBeGreaterThan(5);
    expect(position.speedKph).toBeLessThan(80);
  });

  it("refuses to track a line with no stops", () => {
    expect(() => trackTrip([], DEPARTS)).toThrow(RangeError);
  });
});

describe("stage ETAs", () => {
  it("counts down to a stage and goes negative once passed", () => {
    expect(etaForStop(TIMETABLE, "gigiri", DEPARTS, at(0))).toBeCloseTo(22);
    expect(etaForStop(TIMETABLE, "gigiri", DEPARTS, at(22))).toBeCloseTo(0);
    expect(etaForStop(TIMETABLE, "gigiri", DEPARTS, at(30))).toBeCloseTo(-8);
  });

  it("rejects a stage that is not on the trip", () => {
    expect(() => etaForStop(TIMETABLE, "kikuyu", DEPARTS, at(0))).toThrow(RangeError);
  });
});

describe("geography", () => {
  it("measures a known Nairobi hop", () => {
    // Westlands (Sarit) to the CBD (Kencom) is a little under 5 km as the crow flies.
    const km = haversineKm({ lat: -1.2635, lng: 36.8032 }, { lat: -1.2864, lng: 36.8244 });
    expect(km).toBeGreaterThan(3);
    expect(km).toBeLessThan(5);
  });

  it("returns zero for a point against itself", () => {
    expect(haversineKm({ lat: -1.28, lng: 36.82 }, { lat: -1.28, lng: 36.82 })).toBe(0);
  });

  it("clamps interpolation to the segment", () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 10, lng: 20 };
    expect(interpolate(a, b, -3)).toEqual(a);
    expect(interpolate(a, b, 7)).toEqual(b);
    expect(interpolate(a, b, 0.25)).toEqual({ lat: 2.5, lng: 5 });
  });
});
