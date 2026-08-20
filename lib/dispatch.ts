import "server-only";

import { buildPositionPayload } from "@/lib/position";
import { db } from "@/lib/db";
import { listTrips, tripManifest, type TripSummary } from "@/lib/queries";

/**
 * What a driver needs to know in the next sixty seconds.
 *
 * The run page already tells them everything about the whole day. This module
 * answers the four questions they actually ask while sitting at a stage with
 * the engine running: where am I picking up next, who gets off where, where are
 * the other buses on my line, and should I be moving yet.
 */

type Row = Record<string, unknown>;

/* ------------------------------------------------------------------ *
 * Where to pick up and set down
 * ------------------------------------------------------------------ */

export interface StageCall {
  id: string;
  name: string;
  landmark: string;
  time: string;
  /** Minutes from now until the schedule says the bus is due, delay included. */
  minutesAway: number;
  boarding: number;
  alighting: number;
  called: boolean;
}

/**
 * Every stage on the run with who is waiting there and who leaves there,
 * in travel order. A stage nobody uses is still listed — a driver needs to
 * know they can roll past it, and that is only obvious if it is on the list
 * showing zero.
 */
export function stageCalls(trip: TripSummary, now = new Date()): StageCall[] {
  const manifest = tripManifest(trip.trip.id);

  const boardingBy = new Map<string, number>();
  const alightingBy = new Map<string, number>();
  for (const entry of manifest) {
    if (entry.booking.status === "cancelled") continue;
    boardingBy.set(entry.boardStop.id, (boardingBy.get(entry.boardStop.id) ?? 0) + 1);
    alightingBy.set(entry.alightStop.id, (alightingBy.get(entry.alightStop.id) ?? 0) + 1);
  }

  const called = new Set(
    (
      db()
        .prepare("SELECT stop_id FROM trip_stop_events WHERE trip_id = ?")
        .all(trip.trip.id) as Row[]
    ).map((r) => r.stop_id as string),
  );

  return trip.timetable.map((stop) => ({
    id: stop.id,
    name: stop.name,
    landmark: stop.landmark,
    time: stop.time,
    minutesAway: Math.round(
      (trip.departsAt.getTime() + stop.adjustedMin * 60000 - now.getTime()) / 60000,
    ),
    boarding: boardingBy.get(stop.id) ?? 0,
    alighting: alightingBy.get(stop.id) ?? 0,
    called: called.has(stop.id),
  }));
}

/** The next stage with anyone waiting at it — the one worth pulling over for. */
export function nextPickup(stages: StageCall[]): StageCall | null {
  return stages.find((s) => !s.called && s.boarding > 0) ?? null;
}

/** The next stage where anyone gets off. */
export function nextDropoff(stages: StageCall[]): StageCall | null {
  return stages.find((s) => !s.called && s.alighting > 0) ?? null;
}

/* ------------------------------------------------------------------ *
 * When to leave, when to continue
 * ------------------------------------------------------------------ */

export type Cue = "hold" | "go" | "late" | "done";

export interface DepartureCue {
  cue: Cue;
  headline: string;
  detail: string;
  /** Minutes early (positive) or late (negative) against the schedule. */
  slackMinutes: number;
}

/**
 * Whether to sit or to move.
 *
 * A matatu that leaves early strands the people who timed their walk to the
 * stage; one that sits too long makes everyone behind it late. So the answer
 * is a single word with the number under it, not a clock the driver has to do
 * arithmetic against.
 */
export function departureCue(trip: TripSummary, stages: StageCall[], now = new Date()): DepartureCue {
  const status = trip.trip.status;

  if (status === "completed" || status === "cancelled") {
    return {
      cue: "done",
      headline: "Run finished",
      detail: "Nothing more to call on this one.",
      slackMinutes: 0,
    };
  }

  const nextUncalled = stages.find((s) => !s.called);

  // Before the run starts, the question is about leaving the terminus. A driver
  // who taps "start the run" early leaves a trip marked in_transit while the
  // bus is still standing at the terminus, so the clock decides this, not the
  // status flag — otherwise the cue reads "next stage in 686 min".
  const beforeDeparture = now.getTime() < trip.departsAt.getTime();
  if (status === "scheduled" || status === "boarding" || beforeDeparture) {
    const slack = Math.round((trip.departsAt.getTime() - now.getTime()) / 60000);

    // Past a few hours "hold" is the wrong word — nobody is sitting at the
    // wheel waiting. The run simply has not come round yet.
    if (slack > 360) {
      return {
        cue: "hold",
        headline: `Not yet · ${trip.trip.departTime}`,
        detail: `This run is ${spanWords(slack)} away. Nothing to do on it until then.`,
        slackMinutes: slack,
      };
    }
    if (slack > 5) {
      return {
        cue: "hold",
        headline: `Hold ${spanWords(slack)}`,
        detail: `Leave at ${trip.trip.departTime}. Going early strands anyone still walking to the stop.`,
        slackMinutes: slack,
      };
    }
    if (slack >= 0) {
      return {
        cue: "go",
        headline: slack === 0 ? "Leave now" : `Leave in ${slack} min`,
        detail: `${trip.trip.departTime} departure. Start the run once the door is clear.`,
        slackMinutes: slack,
      };
    }
    return {
      cue: "late",
      headline: `${spanWords(Math.abs(slack))} late`,
      detail: "Start the run and report the reason so control can tell the riders.",
      slackMinutes: slack,
    };
  }

  // On the road, it is about the next stage.
  if (!nextUncalled) {
    return {
      cue: "done",
      headline: "Last stage called",
      detail: "Close the run out when everyone is off.",
      slackMinutes: 0,
    };
  }

  const slack = nextUncalled.minutesAway;
  if (slack > 1) {
    return {
      cue: "go",
      headline: `${nextUncalled.name} in ${spanWords(slack)}`,
      detail:
        nextUncalled.boarding > 0
          ? `${nextUncalled.boarding} waiting to get on there.`
          : "Nobody booked there — roll through unless someone flags you.",
      slackMinutes: slack,
    };
  }
  if (slack >= -2) {
    return {
      cue: "go",
      headline: `${nextUncalled.name} now`,
      detail: `${nextUncalled.boarding} on, ${nextUncalled.alighting} off. Call the stage once you pull in.`,
      slackMinutes: slack,
    };
  }
  return {
    cue: "late",
    headline: `${spanWords(Math.abs(slack))} behind`,
    detail: `${nextUncalled.name} was due at ${nextUncalled.time}. Report it if traffic is holding you.`,
    slackMinutes: slack,
  };
}

/** Minutes while minutes are useful, then hours — nobody reads "686 min". */
function spanWords(minutes: number): string {
  if (minutes < 90) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/* ------------------------------------------------------------------ *
 * The other buses on the line
 * ------------------------------------------------------------------ */

export interface SiblingBus {
  tripId: string;
  plate: string;
  driverName: string;
  departTime: string;
  direction: TripSummary["trip"]["direction"];
  status: string;
  /** 0–100 along the corridor. */
  progressPct: number;
  /** Positive when this bus is further along the line than you are. */
  gapPct: number;
  delayMinutes: number;
  nextStopName: string | null;
  seatsAvailable: number;
}

/**
 * Where everyone else on this line is.
 *
 * Bunching is the whole problem on a Nairobi corridor: three buses nose to
 * tail and then a twenty-minute hole. A driver who can see the bus in front is
 * three minutes ahead knows to ease off without control telling them, so the
 * comparison is drawn along the corridor rather than as a list of times.
 */
export function siblingBuses(trip: TripSummary, now = new Date()): SiblingBus[] {
  const mine = buildPositionPayload(trip.trip.id, now);
  const myProgress = mine ? mine.progress : 0;

  const others = listTrips({
    serviceDate: trip.trip.serviceDate,
    routeId: trip.trip.routeId,
    direction: trip.trip.direction,
  }).filter(
    (t) =>
      t.trip.id !== trip.trip.id &&
      (t.trip.status === "in_transit" || t.trip.status === "boarding"),
  );

  return others
    .map((other) => {
      const position = buildPositionPayload(other.trip.id, now);
      const progress = position?.progress ?? 0;
      return {
        tripId: other.trip.id,
        plate: other.vehicle.plate,
        driverName: other.driver.name,
        departTime: other.trip.departTime,
        direction: other.trip.direction,
        status: other.trip.status,
        progressPct: Math.round(progress * 100),
        gapPct: Math.round((progress - myProgress) * 100),
        delayMinutes: other.trip.delayMinutes,
        nextStopName: position?.nextStop?.name ?? null,
        seatsAvailable: other.seatsAvailable,
      };
    })
    .sort((a, b) => b.progressPct - a.progressPct);
}

/** Your own place on the corridor, for drawing yourself among the others. */
export function ownProgressPct(trip: TripSummary, now = new Date()): number {
  const position = buildPositionPayload(trip.trip.id, now);
  return Math.round((position?.progress ?? 0) * 100);
}
