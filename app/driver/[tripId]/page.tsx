import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { closeTripAction } from "@/app/actions";
import { BoardingForm } from "@/components/boarding-form";
import {
  Badge,
  BookingStatusBadge,
  Card,
  CardHeader,
  DirectionBadge,
  EmptyState,
  Meter,
  Stat,
  TripStatusBadge,
} from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatServiceDate } from "@/lib/domain/time";
import { getTrip, tripManifest } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ tripId: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const trip = getTrip((await params).tripId);
  return { title: trip ? `Door · ${trip.route.code} ${trip.trip.departTime}` : "Door" };
}

export default async function DriverTripPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/");

  const { tripId } = await params;
  const trip = getTrip(tripId);
  if (!trip) notFound();

  const manifest = tripManifest(tripId);
  const boarded = manifest.filter((m) => m.booking.status === "boarded");
  const waiting = manifest.filter((m) => m.booking.status === "booked");
  const closed = trip.trip.status === "completed" || trip.trip.status === "cancelled";

  // Riders grouped by the stage they get on at — the order the door works in.
  const byStop = trip.timetable
    .map((stop) => ({
      stop,
      riders: manifest.filter((m) => m.boardStop.id === stop.id),
    }))
    .filter((group) => group.riders.length > 0);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/driver" className="text-xs text-faint transition-colors hover:text-body">
          ← All departures
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="tabular text-2xl font-semibold tracking-tight text-body">
            {trip.trip.departTime}
          </h1>
          <span className="text-lg text-body">
            <span className="tabular text-brand-bright">{trip.route.code}</span> {trip.route.name}
          </span>
          <DirectionBadge direction={trip.trip.direction} />
          <TripStatusBadge status={trip.trip.status} />
          <Badge>{trip.vehicle.plate}</Badge>
        </div>

        <p className="mt-2 text-sm text-muted">
          {formatServiceDate(trip.trip.serviceDate)} · {trip.vehicle.model} ·{" "}
          {trip.trip.capacity} seats · driver {trip.driver.name} · {trip.timetable[0].name}{" "}
          {trip.timetable[0].time} → {trip.timetable[trip.timetable.length - 1].name}{" "}
          {trip.timetable[trip.timetable.length - 1].time}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Seats sold" value={`${manifest.length} / ${trip.trip.capacity}`} />
        <Stat label="Boarded" value={boarded.length} tone="brand" />
        <Stat label="Still expected" value={waiting.length} tone={waiting.length > 0 ? "amber" : "neutral"} />
        <Stat
          label="Load"
          value={`${Math.round((manifest.length / trip.trip.capacity) * 100)}%`}
          hint={`${trip.trip.capacity - manifest.length} seats unsold`}
        />
      </section>

      {closed ? (
        <Card className="px-5 py-4">
          <p className="text-sm text-muted">
            This departure is closed. {boarded.length} riders boarded and{" "}
            {manifest.length - boarded.length} were marked as no-shows.
          </p>
        </Card>
      ) : (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-[18rem] flex-1">
              <h2 className="text-sm font-semibold text-body">Check a rider in</h2>
              <p className="mt-1 text-xs text-faint">
                Type the six characters from their pass. Codes never use vowels, zero or one.
              </p>
              <div className="mt-4">
                <BoardingForm tripId={trip.trip.id} />
              </div>
            </div>

            <form action={closeTripAction} className="shrink-0">
              <input type="hidden" name="tripId" value={trip.trip.id} />
              <button
                type="submit"
                className="rounded-xl border border-edge px-4 py-2.5 text-sm text-muted transition-colors hover:border-flame/60 hover:text-flame"
              >
                Close the run
              </button>
              <p className="mt-2 max-w-[13rem] text-[11px] leading-relaxed text-faint">
                Marks everyone who never scanned as a no-show and completes the departure.
              </p>
            </form>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Boarding progress</span>
              <span className="tabular">
                {boarded.length} of {manifest.length}
              </span>
            </div>
            <Meter
              pct={manifest.length === 0 ? 0 : (boarded.length / manifest.length) * 100}
              className="mt-2"
            />
          </div>
        </Card>
      )}

      {manifest.length === 0 ? (
        <EmptyState
          title="Nobody booked this departure"
          body="No seats were sold on this run. Nothing to check in at the door."
        />
      ) : (
        <div className="space-y-4">
          {byStop.map(({ stop, riders }) => (
            <Card key={stop.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <span className="tabular text-brand-bright">{stop.time}</span>
                    {stop.name}
                  </span>
                }
                subtitle={`${stop.landmark} · ${riders.length} boarding here`}
                action={
                  <Badge tone={riders.every((r) => r.booking.status === "boarded") ? "brand" : "amber"}>
                    {riders.filter((r) => r.booking.status === "boarded").length} / {riders.length}{" "}
                    on board
                  </Badge>
                }
              />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
                      <th className="px-5 py-2.5 font-medium">Seat</th>
                      <th className="px-5 py-2.5 font-medium">Rider</th>
                      <th className="px-5 py-2.5 font-medium">Employer</th>
                      <th className="px-5 py-2.5 font-medium">Off at</th>
                      <th className="px-5 py-2.5 font-medium">Pass</th>
                      <th className="px-5 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {riders.map((entry) => (
                      <tr
                        key={entry.booking.id}
                        className={entry.booking.status === "boarded" ? "text-faint" : "text-muted"}
                      >
                        <td className="tabular px-5 py-2.5 font-medium text-body">
                          {entry.booking.seatNo}
                        </td>
                        <td className="px-5 py-2.5">
                          <span className={entry.booking.status === "boarded" ? "" : "text-body"}>
                            {entry.employee.name}
                          </span>
                          <span className="ml-2 text-xs text-faint">{entry.employee.phone}</span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-xs">
                          {entry.companyName}
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-xs">
                          {entry.alightStop.name}
                        </td>
                        <td className="px-5 py-2.5 font-mono text-xs tracking-widest">
                          {entry.booking.passCode}
                        </td>
                        <td className="px-5 py-2.5">
                          <BookingStatusBadge status={entry.booking.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
