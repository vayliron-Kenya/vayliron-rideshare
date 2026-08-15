import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LiveMap } from "@/components/live-map";
import { Badge, Card, DirectionBadge, TripStatusBadge } from "@/components/ui";
import { getSession } from "@/lib/auth";
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
  const session = await getSession();
  if (!session) redirect("/");

  const { tripId } = await params;
  const trip = getTrip(tripId);
  const payload = buildPositionPayload(tripId);
  if (!trip || !payload) notFound();

  const myBooking = listBookingsForEmployee(session.employee.id, {}).find(
    (b) => b.booking.tripId === tripId && b.booking.status !== "cancelled",
  );

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={myBooking ? "/bookings" : `/routes/${trip.route.slug}`}
          className="text-xs text-faint transition-colors hover:text-body"
        >
          ← {myBooking ? "My trips" : `${trip.route.code} ${trip.route.name}`}
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-body">
            <span className="tabular text-brand-bright">{trip.route.code}</span>{" "}
            {trip.route.name}
          </h1>
          <DirectionBadge direction={trip.trip.direction} />
          <TripStatusBadge status={trip.trip.status} />
          <Badge>{trip.vehicle.plate}</Badge>
        </div>

        <p className="mt-2 text-sm text-muted">
          {formatServiceDate(trip.trip.serviceDate)} · departs {trip.trip.departTime} ·{" "}
          {trip.driver.name} ({(trip.driver.ratingBps / 1000).toFixed(1)}★) ·{" "}
          {trip.seatsBooked} of {trip.trip.capacity} seats sold · traffic factor ×
          {trip.peakFactor.toFixed(2)}
        </p>
      </header>

      {myBooking ? (
        <Card className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-faint">Your stage</p>
            <p className="mt-0.5 text-sm font-medium text-body">{myBooking.boardStop.name}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-faint">Scheduled</p>
            <p className="tabular mt-0.5 text-sm font-medium text-body">{myBooking.boardTime}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-faint">Seat</p>
            <p className="tabular mt-0.5 text-sm font-medium text-body">
              {myBooking.booking.seatNo}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-faint">Pass code</p>
            <p className="mt-0.5 font-mono text-sm font-semibold tracking-[0.2em] text-brand-bright">
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
