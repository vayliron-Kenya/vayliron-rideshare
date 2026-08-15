import { etaForStop, trackTrip, type RunState } from "@/lib/domain/tracking";
import { getTrip, latestPing } from "@/lib/queries";

/** A ping older than this is stale, and the timetable is the better estimate. */
const PING_FRESHNESS_MS = 3 * 60 * 1000;

export interface PositionStop {
  id: string;
  name: string;
  landmark: string;
  lat: number;
  lng: number;
  time: string;
  kmFromStart: number;
  etaMinutes: number;
}

export interface PositionPayload {
  tripId: string;
  status: string;
  state: RunState;
  /** Whether the coordinates came from a tracker or were derived from the timetable. */
  source: "tracker" | "schedule";
  position: { lat: number; lng: number };
  heading: number;
  progress: number;
  speedKph: number;
  minutesSinceDeparture: number;
  nextStop: { id: string; name: string; time: string; etaMinutes: number } | null;
  stops: PositionStop[];
  updatedAt: string;
}

/**
 * Single source of truth for "where is this bus" — served by the polling
 * endpoint and used to render the first frame on the server, so the map never
 * flashes an empty state before the first fetch lands.
 */
export function buildPositionPayload(tripId: string, now: Date = new Date()): PositionPayload | null {
  const trip = getTrip(tripId);
  if (!trip) return null;

  const tracked = trackTrip(trip.timetable, trip.departsAt, now);

  const ping = latestPing(tripId);
  const pingIsFresh =
    ping !== null && now.getTime() - new Date(ping.recordedAt).getTime() < PING_FRESHNESS_MS;

  return {
    tripId,
    status: trip.trip.status,
    state: tracked.state,
    source: pingIsFresh ? "tracker" : "schedule",
    position: pingIsFresh ? { lat: ping.lat, lng: ping.lng } : tracked.position,
    heading: tracked.heading,
    progress: Number(tracked.progress.toFixed(4)),
    speedKph: pingIsFresh ? ping.speedKph : tracked.speedKph,
    minutesSinceDeparture: Math.round(tracked.minutesSinceDeparture),
    nextStop: tracked.nextStop
      ? {
          id: tracked.nextStop.id,
          name: tracked.nextStop.name,
          time: tracked.nextStop.time,
          etaMinutes: Math.round(tracked.etaMinutes),
        }
      : null,
    stops: trip.timetable.map((stop) => ({
      id: stop.id,
      name: stop.name,
      landmark: stop.landmark,
      lat: stop.lat,
      lng: stop.lng,
      time: stop.time,
      kmFromStart: stop.kmFromStart,
      etaMinutes: Math.round(etaForStop(trip.timetable, stop.id, trip.departsAt, now)),
    })),
    updatedAt: now.toISOString(),
  };
}
