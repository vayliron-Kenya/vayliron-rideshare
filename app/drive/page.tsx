import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge, Card, CardHeader, DirectionBadge, EmptyState, Meter, Stat, TripStatusBadge } from "@/components/ui";
import { getDriverSession, getOperatorSession } from "@/lib/auth";
import { nextServiceDate } from "@/lib/domain/schedule";
import { addDays, formatServiceDate, nairobiDate, relativeMinutes } from "@/lib/domain/time";
import { driverRuns, driverStats } from "@/lib/ops";
import { listTrips } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "My runs" };

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function DrivePage({ searchParams }: PageProps) {
  const driver = await getDriverSession();
  const operator = await getOperatorSession();
  if (!driver && !operator) redirect("/");

  const { date } = await searchParams;
  const today = nairobiDate();
  const serviceDate = date ?? nextServiceDate(today);
  const now = Date.now();

  // A controller opening this view is covering the door, so they see the whole
  // day rather than one driver's roster.
  const runs = driver
    ? driverRuns(driver.id, serviceDate)
    : listTrips({ serviceDate, includeCancelled: true }).sort(
        (a, b) => a.departsAt.getTime() - b.departsAt.getTime(),
      );

  const stats = driver
    ? driverStats(driver.id, `${today.slice(0, 7)}-01`, today)
    : null;

  const live = runs.filter(
    (t) => t.trip.status === "boarding" || t.trip.status === "in_transit",
  );
  const upcoming = runs.filter(
    (t) => t.trip.status === "scheduled" && t.departsAt.getTime() > now,
  );
  const done = runs.filter(
    (t) => t.trip.status === "completed" || t.trip.status === "cancelled",
  );

  const seatsToday = runs
    .filter((t) => t.trip.status !== "cancelled")
    .reduce((sum, t) => sum + t.seatsBooked, 0);

  const dates = [today, addDays(today, 1), addDays(today, 2)].map((d) => nextServiceDate(d));

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-wider text-faint">
          {driver ? `PSV ${driver.psvLicence}` : "Covering the door from control"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-body">
          {driver ? `Karibu, ${driver.name.split(" ")[0]}.` : "All runs today"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {formatServiceDate(serviceDate)} · {runs.length} {runs.length === 1 ? "run" : "runs"} ·{" "}
          {seatsToday} riders expected
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {[...new Set(dates)].map((option) => (
          <Link
            key={option}
            href={`/drive?date=${option}`}
            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
              option === serviceDate
                ? "border-brand/60 bg-brand-soft text-brand-bright"
                : "border-edge text-muted hover:text-body"
            }`}
          >
            {option === today ? "Today" : formatServiceDate(option)}
          </Link>
        ))}
      </div>

      {stats ? (
        <section className="grid grid-cols-3 gap-3">
          <Stat label="Runs this month" value={stats.runsThisMonth} />
          <Stat label="Riders carried" value={stats.ridersCarried.toLocaleString("en-KE")} tone="brand" />
          <Stat
            label="On time"
            value={`${stats.onTimePct}%`}
            tone={stats.onTimePct >= 85 ? "brand" : "amber"}
            hint="Within 5 minutes"
          />
        </section>
      ) : null}

      {live.length > 0 ? (
        <Card>
          <CardHeader title="Now" subtitle="Boarding or on the road" />
          <div className="divide-y divide-line">
            {live.map((trip) => (
              <RunRow key={trip.trip.id} trip={trip} now={now} primary />
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Still to run"
          subtitle={`${upcoming.length} left on ${formatServiceDate(serviceDate)}`}
        />
        {upcoming.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nothing left today"
              body="Every run on this service day has already left its first stage."
            />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {upcoming.slice(0, 12).map((trip) => (
              <RunRow key={trip.trip.id} trip={trip} now={now} />
            ))}
          </div>
        )}
      </Card>

      {done.length > 0 ? (
        <Card>
          <CardHeader title="Finished" subtitle={`${done.length} closed out`} />
          <div className="divide-y divide-line">
            {done.slice(-6).map((trip) => (
              <RunRow key={trip.trip.id} trip={trip} now={now} />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function RunRow({
  trip,
  now,
  primary = false,
}: {
  trip: ReturnType<typeof listTrips>[number];
  now: number;
  primary?: boolean;
}) {
  const minutes = (trip.departsAt.getTime() - now) / 60000;

  return (
    <Link
      href={`/drive/${trip.trip.id}`}
      className={`block px-4 py-4 transition-colors hover:bg-raised/50 sm:px-5 ${
        primary ? "bg-brand-soft/25" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="w-16 shrink-0">
          <p className="tabular text-xl font-semibold text-body">{trip.trip.departTime}</p>
          {trip.trip.delayMinutes > 0 ? (
            <p className="tabular text-[11px] text-flame">+{trip.trip.delayMinutes} min</p>
          ) : (
            <p className="text-[11px] text-faint">{relativeMinutes(minutes)}</p>
          )}
        </div>

        <div className="min-w-[11rem] flex-1">
          <p className="text-sm font-medium text-body">
            <span className="tabular text-brand-bright">{trip.route.code}</span>{" "}
            {trip.route.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-faint">
            {trip.timetable[0].name} → {trip.timetable[trip.timetable.length - 1].name} ·{" "}
            {trip.vehicle.plate}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <DirectionBadge direction={trip.trip.direction} />
          <TripStatusBadge status={trip.trip.status} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Meter
          pct={(trip.seatsBooked / trip.trip.capacity) * 100}
          className="max-w-xs flex-1"
        />
        <span className="tabular shrink-0 text-xs text-muted">
          {trip.seatsBooked} / {trip.trip.capacity} riders
        </span>
        {trip.trip.status === "cancelled" ? <Badge tone="flame">cancelled</Badge> : null}
      </div>
    </Link>
  );
}
