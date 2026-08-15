import { addDays, dayOfWeek } from "@/lib/domain/time";
import type { Direction, RouteStop } from "@/lib/types";

/** Departure times we run every weekday, per direction. */
export const TIMETABLE: Record<Direction, readonly string[]> = {
  inbound: ["05:30", "06:00", "06:30", "07:00"],
  outbound: ["16:45", "17:30", "18:15", "19:00"],
};

/**
 * Saturday half-day service. Plenty of Nairobi employers still run a Saturday
 * morning, and those staff need a way home at lunchtime — a thinner timetable,
 * not an absent one.
 */
export const SATURDAY_TIMETABLE: Record<Direction, readonly string[]> = {
  inbound: ["06:30", "07:15"],
  outbound: ["12:30", "13:30"],
};

/** Monday–Saturday. Sunday has no scheduled corporate service. */
export function isServiceDay(serviceDate: string): boolean {
  const day = dayOfWeek(serviceDate);
  return day >= 1 && day <= 6;
}

export function timetableFor(serviceDate: string, direction: Direction): readonly string[] {
  if (dayOfWeek(serviceDate) === 6) return SATURDAY_TIMETABLE[direction];
  if (dayOfWeek(serviceDate) === 0) return [];
  return TIMETABLE[direction];
}

/** The given date if buses run on it, otherwise the next date they do. */
export function nextServiceDate(from: string): string {
  let date = from;
  for (let i = 0; i < 7; i += 1) {
    if (isServiceDay(date)) return date;
    date = addDays(date, 1);
  }
  return from;
}

export function parseHhmm(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new RangeError(`expected HH:MM, got "${hhmm}"`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) throw new RangeError(`invalid time "${hhmm}"`);
  return hours * 60 + minutes;
}

export function formatHhmm(minutesOfDay: number): string {
  const wrapped = ((minutesOfDay % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * How much slower than free-flow the corridor runs at a given departure time.
 *
 * These are the numbers that make a Nairobi timetable honest: a 07:00
 * departure off Thika Road is not the same trip as the same bus at 05:30, and
 * quoting one arrival time for both is how a shuttle service loses its riders.
 */
export function peakFactor(departTime: string): number {
  const t = parseHhmm(departTime);
  const between = (from: string, to: string) => t >= parseHhmm(from) && t < parseHhmm(to);

  if (between("05:00", "06:00")) return 1.15;
  if (between("06:00", "06:30")) return 1.4;
  if (between("06:30", "07:30")) return 1.6;
  if (between("07:30", "09:00")) return 1.75;
  if (between("16:00", "17:00")) return 1.4;
  if (between("17:00", "18:30")) return 1.7;
  if (between("18:30", "20:00")) return 1.45;
  return 1.1;
}

/**
 * Returns the route's stops in travel order for the given direction, with
 * distances and durations rebased on that direction's first stop.
 */
export function orderedStops(stops: readonly RouteStop[], direction: Direction): RouteStop[] {
  const bySeq = [...stops].sort((a, b) => a.seq - b.seq);
  if (direction === "inbound") return bySeq;

  const totalKm = bySeq[bySeq.length - 1]?.kmFromStart ?? 0;
  const totalMin = bySeq[bySeq.length - 1]?.minFromStart ?? 0;

  return bySeq
    .slice()
    .reverse()
    .map((stop, index) => ({
      ...stop,
      seq: index,
      kmFromStart: round1(totalKm - stop.kmFromStart),
      minFromStart: totalMin - stop.minFromStart,
    }));
}

export interface TimetableEntry extends RouteStop {
  /** Free-flow minutes scaled by the peak factor for this departure. */
  adjustedMin: number;
  /** Clock time at this stop, HH:MM. */
  time: string;
}

/** Expands a departure into a stop-by-stop timetable. */
export function buildTimetable(
  stopsInOrder: readonly RouteStop[],
  departTime: string,
): TimetableEntry[] {
  const factor = peakFactor(departTime);
  const departMinutes = parseHhmm(departTime);

  return stopsInOrder.map((stop) => {
    const adjustedMin = Math.round(stop.minFromStart * factor);
    return {
      ...stop,
      adjustedMin,
      time: formatHhmm(departMinutes + adjustedMin),
    };
  });
}

/** Total scheduled duration of a departure, in minutes. */
export function tripDurationMinutes(
  stopsInOrder: readonly RouteStop[],
  departTime: string,
): number {
  const timetable = buildTimetable(stopsInOrder, departTime);
  return timetable[timetable.length - 1]?.adjustedMin ?? 0;
}

/**
 * Distance actually travelled between two stops on a route. Throws if the
 * stops are not on the route, or if they are the wrong way round for the
 * direction — booking Westlands -> Kikuyu on an inbound bus is a mistake we
 * want to catch before it reaches the database.
 */
export function legKm(
  stopsInOrder: readonly RouteStop[],
  boardStopId: string,
  alightStopId: string,
): number {
  const board = stopsInOrder.find((s) => s.id === boardStopId);
  const alight = stopsInOrder.find((s) => s.id === alightStopId);

  if (!board) throw new RangeError(`boarding stop ${boardStopId} is not on this route`);
  if (!alight) throw new RangeError(`alighting stop ${alightStopId} is not on this route`);
  if (board.seq === alight.seq) throw new RangeError("boarding and alighting stops must differ");
  if (board.seq > alight.seq) {
    throw new RangeError("alighting stop comes before the boarding stop on this trip");
  }

  return round1(alight.kmFromStart - board.kmFromStart);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
