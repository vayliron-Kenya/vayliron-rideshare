import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BookingForm, type StopOption } from "@/components/booking-form";
import { Badge, Card, DirectionBadge, EmptyState, TripStatusBadge } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatServiceDate, nairobiDate, relativeMinutes } from "@/lib/domain/time";
import { employerSpendThisMonth, getTrip, takenSeats } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ board?: string; alight?: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const trip = getTrip((await params).tripId);
  return { title: trip ? `Book ${trip.route.code} ${trip.trip.departTime}` : "Book a seat" };
}

export default async function BookPage({ params, searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/");

  const { tripId } = await params;
  const query = await searchParams;

  const trip = getTrip(tripId);
  if (!trip) notFound();

  const taken = takenSeats(tripId);
  const stops: StopOption[] = trip.timetable.map((entry) => ({
    id: entry.id,
    name: entry.name,
    landmark: entry.landmark,
    time: entry.time,
    seq: entry.seq,
    kmFromStart: entry.kmFromStart,
  }));

  const closed =
    trip.trip.status === "completed" ||
    trip.trip.status === "cancelled" ||
    trip.departsAt.getTime() <= Date.now();

  // Prefer the leg the rider arrived with; otherwise their own home/work stages;
  // otherwise the whole line.
  const defaultBoard =
    pickStop(stops, query.board) ??
    pickStop(stops, session.employee.homeStopId) ??
    stops[0];
  const defaultAlight =
    pickStop(stops, query.alight, defaultBoard.seq) ??
    pickStop(stops, session.employee.workStopId, defaultBoard.seq) ??
    stops[stops.length - 1];

  const minutesToDeparture = (trip.departsAt.getTime() - Date.now()) / 60000;

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/routes/${trip.route.slug}`}
          className="text-xs text-faint transition-colors hover:text-body"
        >
          ← {trip.route.code} {trip.route.name}
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="tabular text-2xl font-semibold tracking-tight text-body">
            {trip.trip.departTime}
          </h1>
          <span className="text-sm text-muted">{formatServiceDate(trip.trip.serviceDate)}</span>
          <DirectionBadge direction={trip.trip.direction} />
          <TripStatusBadge status={trip.trip.status} />
          {minutesToDeparture > 0 ? (
            <Badge tone="sky">Departs {relativeMinutes(minutesToDeparture)}</Badge>
          ) : null}
        </div>

        <p className="mt-2 text-sm text-muted">
          {trip.vehicle.model} · {trip.vehicle.plate} · {trip.trip.capacity} seats ·{" "}
          {trip.vehicle.wifi ? "Wi-Fi on board" : "No Wi-Fi"} · Driver {trip.driver.name} (
          {(trip.driver.ratingBps / 1000).toFixed(1)}★) · Traffic factor ×
          {trip.peakFactor.toFixed(2)}
        </p>
      </header>

      {closed ? (
        <EmptyState
          title="This departure has closed"
          body="Bookings shut when the bus leaves its first stage. Pick a later departure on this line."
          action={
            <Link
              href={`/routes/${trip.route.slug}`}
              className="inline-flex rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-ink"
            >
              See later departures
            </Link>
          }
        />
      ) : trip.seatsAvailable === 0 ? (
        <EmptyState
          title="Fully booked"
          body={`All ${trip.trip.capacity} seats on ${trip.vehicle.plate} are taken. Try the next departure on this line.`}
          action={
            <Link
              href={`/routes/${trip.route.slug}`}
              className="inline-flex rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-ink"
            >
              See later departures
            </Link>
          }
        />
      ) : (
        <>
          <Card className="px-5 py-3">
            <p className="text-xs text-muted">
              <span className="tabular font-semibold text-brand-bright">
                {trip.seatsAvailable}
              </span>{" "}
              of {trip.trip.capacity} seats still free ·{" "}
              {trip.timetable[0].name} {trip.timetable[0].time} →{" "}
              {trip.timetable[trip.timetable.length - 1].name}{" "}
              {trip.timetable[trip.timetable.length - 1].time}
            </p>
          </Card>

          <BookingForm
            tripId={trip.trip.id}
            capacity={trip.trip.capacity}
            takenSeats={taken}
            stops={stops}
            defaultBoardId={defaultBoard.id}
            defaultAlightId={defaultAlight.id}
            subsidyBps={session.company.subsidyBps}
            monthlyCapKes={session.company.monthlyCapKes}
            monthToDateKes={employerSpendThisMonth(
              session.employee.id,
              trip.trip.serviceDate || nairobiDate(),
            )}
            companyName={session.company.name}
          />
        </>
      )}
    </div>
  );
}

function pickStop(
  stops: StopOption[],
  id: string | null | undefined,
  afterSeq?: number,
): StopOption | undefined {
  if (!id) return undefined;
  const found = stops.find((s) => s.id === id);
  if (!found) return undefined;
  if (afterSeq !== undefined && found.seq <= afterSeq) return undefined;
  return found;
}
