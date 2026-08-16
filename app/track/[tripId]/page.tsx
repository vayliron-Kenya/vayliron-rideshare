import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LiveMap } from "@/components/live-map";
import { Badge, Card, DirectionBadge, TripStatusBadge } from "@/components/ui";
import { getPrincipal, getSession } from "@/lib/auth";
import { crowding, CROWDING_LABEL } from "@/lib/domain/boarding";
import { formatServiceDate } from "@/lib/domain/time";
import { buildPositionPayload } from "@/lib/position";
import { getTrip, listBookingsForEmployee } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ tripId: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const trip = getTrip((await params).tripId);
  return { title: trip ? `Tracking ${trip.route.code} ${trip.trip.departTime}` : "Tracking" };
}

export default async function TrackPage({ params }: PageProps) {
  // Riders track their own bus; drivers and control watch any of them.
  const principal = await getPrincipal();
  if (!principal) redirect("/");
  const session = await getSession();

  const { tripId } = await params;
  const trip = getTrip(tripId);
  const payload = buildPositionPayload(tripId);
  if (!trip || !payload) notFound();

  const myBooking = session
    ? listBookingsForEmployee(session.employee.id, {}).find(
        (b) => b.booking.tripId === tripId && b.booking.status !== "cancelled",
      )
    : undefined;

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={myBooking ? "/bookings" : `/routes/${trip.route.slug}`}
          className="inline-flex min-h-11 items-center text-base text-muted transition-colors hover:text-body"
        >
          ← {myBooking ? "Trips" : `${trip.route.code} ${trip.route.name}`}
        </Link>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-body">
            <span className="tabular text-accent">{trip.route.code}</span>{" "}
            {trip.route.name}
          </h1>
          <DirectionBadge direction={trip.trip.direction} />
          <TripStatusBadge status={trip.trip.status} />
          <Badge>{trip.vehicle.plate}</Badge>
          {trip.trip.delayMinutes > 0 ? (
            <Badge tone="flame">{trip.trip.delayMinutes} min late</Badge>
          ) : null}
        </div>

        {trip.trip.status === "cancelled" ? (
          <p className="mt-3 rounded-xl bg-flame-soft px-4 py-3 text-sm text-flame">
            This departure was cancelled{trip.trip.cancelReason ? ` — ${trip.trip.cancelReason}` : ""}.
            Your booking has been released, so catch another bus on this line.
          </p>
        ) : trip.trip.delayMinutes > 0 ? (
          <p className="mt-3 rounded-xl bg-amber-soft px-4 py-3 text-sm text-amber">
            The driver has reported this run {trip.trip.delayMinutes} minutes behind. Every arrival
            time below already includes it.
          </p>
        ) : null}

        <p className="mt-2 text-sm leading-relaxed text-muted">
          {formatServiceDate(trip.trip.serviceDate)} · departs {trip.trip.departTime} · driven by{" "}
          {trip.driver.name} ({(trip.driver.ratingBps / 1000).toFixed(1)}★) ·{" "}
          {CROWDING_LABEL[crowding(trip.trip.capacity, trip.seatsBooked)].toLowerCase()} · traffic
          running ×{trip.peakFactor.toFixed(2)}
        </p>
      </header>

      {myBooking ? (
        <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-faint">
              You get on at
            </p>
            <p className="mt-0.5 text-lg font-bold text-body">{myBooking.boardStop.name}</p>
            <p className="tabular text-sm text-muted">scheduled {myBooking.boardTime}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-faint">Pass code</p>
            <p className="mt-0.5 font-mono text-2xl font-bold tracking-[0.18em] text-accent">
              {myBooking.booking.passCode}
            </p>
          </div>
        </Card>
      ) : null}

      <LiveMap initial={payload} highlightStopId={myBooking?.boardStop.id} />

      <p className="text-xs text-faint">
        Position refreshes every 15 seconds. When a bus has no live tracker reporting, Vayliron
        falls back to the timetable adjusted for the traffic factor on that departure — which is
        why the estimate still moves.
      </p>
    </div>
  );
}
