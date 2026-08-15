import { bearing, interpolate, type LatLng } from "@/lib/domain/geo";
import type { TimetableEntry } from "@/lib/domain/schedule";

export type RunState = "not_departed" | "en_route" | "arrived";

export interface TripPosition {
  state: RunState;
  position: LatLng;
  /** Heading in degrees, 0 = north. */
  heading: number;
  /** 0..1 along the timetable. */
  progress: number;
  minutesSinceDeparture: number;
  lastStop: TimetableEntry | null;
  nextStop: TimetableEntry | null;
  /** Minutes until the next stop, or until departure when not yet moving. */
  etaMinutes: number;
  /** Rough speed over the current leg, km/h. */
  speedKph: number;
}

/**
 * Where a bus is right now, derived from its timetable.
 *
 * Real vehicles report GPS pings, but a scheduled trip with no tracker yet
 * still needs a position to show on the board — so the schedule itself acts as
 * the fallback source of truth, and a live ping simply overrides it.
 */
export function trackTrip(
  timetable: readonly TimetableEntry[],
  departsAt: Date,
  now: Date = new Date(),
): TripPosition {
  if (timetable.length === 0) {
    throw new RangeError("cannot track a trip with no stops");
  }

  const first = timetable[0];
  const last = timetable[timetable.length - 1];
  const elapsed = (now.getTime() - departsAt.getTime()) / 60000;

  if (elapsed <= 0) {
    return {
      state: "not_departed",
      position: { lat: first.lat, lng: first.lng },
      heading: timetable.length > 1 ? bearing(first, timetable[1]) : 0,
      progress: 0,
      minutesSinceDeparture: elapsed,
      lastStop: null,
      nextStop: first,
      etaMinutes: -elapsed,
      speedKph: 0,
    };
  }

  if (elapsed >= last.adjustedMin) {
    return {
      state: "arrived",
      position: { lat: last.lat, lng: last.lng },
      heading: timetable.length > 1 ? bearing(timetable[timetable.length - 2], last) : 0,
      progress: 1,
      minutesSinceDeparture: elapsed,
      lastStop: last,
      nextStop: null,
      etaMinutes: 0,
      speedKph: 0,
    };
  }

  let index = 0;
  for (let i = 0; i < timetable.length - 1; i += 1) {
    if (elapsed >= timetable[i].adjustedMin) index = i;
  }

  const from = timetable[index];
  const to = timetable[index + 1];
  const legMinutes = to.adjustedMin - from.adjustedMin;
  const t = legMinutes > 0 ? (elapsed - from.adjustedMin) / legMinutes : 1;
  const legKm = to.kmFromStart - from.kmFromStart;

  return {
    state: "en_route",
    position: interpolate(from, to, t),
    heading: bearing(from, to),
    progress: elapsed / last.adjustedMin,
    minutesSinceDeparture: elapsed,
    lastStop: from,
    nextStop: to,
    etaMinutes: to.adjustedMin - elapsed,
    speedKph: legMinutes > 0 ? Math.round((legKm / legMinutes) * 60) : 0,
  };
}

/** Minutes until the bus reaches a specific stop. Negative once it has passed. */
export function etaForStop(
  timetable: readonly TimetableEntry[],
  stopId: string,
  departsAt: Date,
  now: Date = new Date(),
): number {
  const stop = timetable.find((s) => s.id === stopId);
  if (!stop) throw new RangeError(`stop ${stopId} is not on this trip`);

  const elapsed = (now.getTime() - departsAt.getTime()) / 60000;
  return stop.adjustedMin - elapsed;
}
