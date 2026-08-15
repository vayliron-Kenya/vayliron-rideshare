import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardHeader, DirectionBadge, EmptyState, Meter, TripStatusBadge } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { nextServiceDate } from "@/lib/domain/schedule";
import { formatServiceDate, nairobiDate, relativeMinutes } from "@/lib/domain/time";
import { listTrips } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Door" };

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function DriverPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/");

  const { date } = await searchParams;
  const today = nairobiDate();
  const serviceDate = date ?? nextServiceDate(today);
  const now = Date.now();

  const trips = listTrips({ serviceDate }).sort(
    (a, b) => a.departsAt.getTime() - b.departsAt.getTime(),
  );

  const live = trips.filter(
    (t) => t.trip.status === "boarding" || t.trip.status === "in_transit",
  );
  const upcoming = trips.filter(
    (t) => t.departsAt.getTime() > now && t.trip.status === "scheduled",
  );
  const done = trips.filter((t) => t.trip.status === "completed");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-body">Door &amp; manifest</h1>
        <p className="mt-1 text-sm text-muted">
          {formatServiceDate(serviceDate)} · {trips.length} departures ·{" "}
          {live.length} running now
        </p>
        <p className="mt-2 text-xs text-faint">
          Open a departure to check riders in against their pass code and close it out at the end
          of the run.
        </p>
      </header>

      {live.length > 0 ? (
        <Card>
          <CardHeader title="Running now" subtitle="Boarding or on the road" />
          <div className="divide-y divide-line">
            {live.map((trip) => (
              <TripRow key={trip.trip.id} trip={trip} now={now} />
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Still to run"
          subtitle={`${upcoming.length} departures left on ${formatServiceDate(serviceDate)}`}
        />
        {upcoming.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nothing left today"
              body="Every departure on this service day has already left its first stage."
            />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {upcoming.slice(0, 24).map((trip) => (
              <TripRow key={trip.trip.id} trip={trip} now={now} />
            ))}
          </div>
        )}
      </Card>

      {done.length > 0 ? (
        <Card>
          <CardHeader title="Completed" subtitle={`${done.length} departures closed out`} />
          <div className="divide-y divide-line">
            {done.slice(-8).map((trip) => (
              <TripRow key={trip.trip.id} trip={trip} now={now} />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function TripRow({
  trip,
  now,
}: {
  trip: ReturnType<typeof listTrips>[number];
  now: number;
}) {
  const occupancy = Math.round((trip.seatsBooked / trip.trip.capacity) * 100);
  const minutes = (trip.departsAt.getTime() - now) / 60000;

  return (
    <Link
      href={`/driver/${trip.trip.id}`}
      className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4 transition-colors hover:bg-raised/50"
    >
      <div className="w-16 shrink-0">
        <p className="tabular text-lg font-semibold text-body">{trip.trip.departTime}</p>
        <p className="text-[11px] text-faint">{relativeMinutes(minutes)}</p>
      </div>

      <div className="min-w-[12rem] flex-1">
        <p className="text-sm font-medium text-body">
          <span className="tabular text-brand-bright">{trip.route.code}</span> {trip.route.name}
        </p>
        <p className="mt-0.5 text-xs text-faint">
          {trip.vehicle.plate} · {trip.driver.name} · {trip.timetable[0].name} →{" "}
          {trip.timetable[trip.timetable.length - 1].name}
        </p>
      </div>

      <div className="w-32 shrink-0">
        <p className="tabular text-xs text-muted">
          {trip.seatsBooked} / {trip.trip.capacity} sold
        </p>
        <Meter pct={occupancy} className="mt-1.5" />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <DirectionBadge direction={trip.trip.direction} />
        <TripStatusBadge status={trip.trip.status} />
      </div>
    </Link>
  );
}
