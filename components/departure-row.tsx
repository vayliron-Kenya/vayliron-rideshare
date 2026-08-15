import Link from "next/link";

import { Meter, TripStatusBadge } from "@/components/ui";
import { formatKes } from "@/lib/domain/fares";
import type { TripSummary } from "@/lib/queries";

function occupancyTone(pct: number) {
  if (pct >= 90) return "flame" as const;
  if (pct >= 70) return "amber" as const;
  return "brand" as const;
}

export function DepartureRow({
  trip,
  boardStopId,
  alightStopId,
  fareKes,
  alreadyBooked = false,
}: {
  trip: TripSummary;
  /** When supplied, the row books this specific leg instead of the whole line. */
  boardStopId?: string;
  alightStopId?: string;
  fareKes?: number;
  /** The signed-in rider already holds a seat on this departure. */
  alreadyBooked?: boolean;
}) {
  const board = boardStopId ? trip.timetable.find((s) => s.id === boardStopId) : undefined;
  const alight = alightStopId ? trip.timetable.find((s) => s.id === alightStopId) : undefined;

  const from = board ?? trip.timetable[0];
  const to = alight ?? trip.timetable[trip.timetable.length - 1];
  const occupancy = Math.round((trip.seatsBooked / trip.trip.capacity) * 100);
  const bookable =
    trip.seatsAvailable > 0 &&
    trip.trip.status !== "completed" &&
    trip.trip.status !== "cancelled" &&
    trip.departsAt.getTime() > Date.now();

  const query = new URLSearchParams();
  if (boardStopId) query.set("board", boardStopId);
  if (alightStopId) query.set("alight", alightStopId);
  const bookHref = `/book/${trip.trip.id}${query.size ? `?${query}` : ""}`;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line px-5 py-4 last:border-b-0">
      <div className="w-[4.5rem] shrink-0">
        <p className="tabular text-lg font-semibold text-body">{from.time}</p>
        <p className="tabular text-xs text-faint">→ {to.time}</p>
      </div>

      <div className="min-w-[12rem] flex-1">
        <p className="text-sm font-medium text-body">
          <span className="tabular text-accent">{trip.route.code}</span>{" "}
          {trip.route.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-faint">
          {from.name} → {to.name} · {trip.vehicle.model} · {trip.vehicle.plate}
          {trip.vehicle.wifi ? " · Wi-Fi" : ""}
        </p>
      </div>

      <div className="w-32 shrink-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="tabular text-xs text-muted">{trip.seatsAvailable} free</span>
          <span className="tabular text-[11px] text-faint">{occupancy}%</span>
        </div>
        <Meter pct={occupancy} tone={occupancyTone(occupancy)} className="mt-1.5" />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {fareKes !== undefined ? (
          <span className="tabular text-sm text-muted">{formatKes(fareKes)}</span>
        ) : null}
        <TripStatusBadge status={trip.trip.status} />
        {alreadyBooked ? (
          <Link
            href="/bookings"
            className="rounded-lg border border-brand/50 bg-brand-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-brand-soft/70"
          >
            Booked
          </Link>
        ) : trip.trip.status === "in_transit" ? (
          <Link
            href={`/track/${trip.trip.id}`}
            className="rounded-lg border border-brand/50 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-brand-soft"
          >
            Track
          </Link>
        ) : bookable ? (
          <Link
            href={bookHref}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand transition-colors hover:bg-brand-hover"
          >
            Book
          </Link>
        ) : (
          <span className="rounded-lg border border-edge px-3 py-1.5 text-xs text-faint">
            {trip.seatsAvailable === 0 ? "Full" : "Closed"}
          </span>
        )}
      </div>
    </div>
  );
}
