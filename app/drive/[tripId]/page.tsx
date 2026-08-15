import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  endRunAction,
  markArrivedAction,
  openBoardingAction,
  reportIncidentAction,
  setDelayAction,
  startRunAction,
} from "@/app/drive-actions";
import { ActionForm, Field, SelectField, TextAreaField } from "@/components/action-form";
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
import { getDriverSession, getOperatorSession } from "@/lib/auth";
import { formatServiceDate, relativeMinutes } from "@/lib/domain/time";
import { tripIncidents, tripStopEvents } from "@/lib/ops";
import { getTrip, tripManifest } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ tripId: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const trip = getTrip((await params).tripId);
  return { title: trip ? `${trip.route.code} ${trip.trip.departTime}` : "Run" };
}

const NAIROBI_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Nairobi",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default async function DriveRunPage({ params }: PageProps) {
  const driver = await getDriverSession();
  const operator = await getOperatorSession();
  if (!driver && !operator) redirect("/");

  const { tripId } = await params;
  const trip = getTrip(tripId);
  if (!trip) notFound();

  // A driver may only work the runs they are rostered on.
  if (driver && trip.trip.driverId !== driver.id) {
    return (
      <EmptyState
        title="Not your run"
        body="You are not rostered on this departure. Check your list of runs for today."
        action={
          <Link href="/drive" className="inline-flex rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-ink">
            Back to my runs
          </Link>
        }
      />
    );
  }

  const manifest = tripManifest(tripId);
  const incidents = tripIncidents(tripId);
  const arrivals = new Map(tripStopEvents(tripId).map((e) => [e.stopId, e.arrivedAt]));

  const boarded = manifest.filter((m) => m.booking.status === "boarded");
  const waiting = manifest.filter((m) => m.booking.status === "booked");
  const status = trip.trip.status;
  const finished = status === "completed" || status === "cancelled";
  const running = status === "in_transit";

  const byStop = trip.timetable
    .map((stop) => ({
      stop,
      arrivedAt: arrivals.get(stop.id) ?? null,
      riders: manifest.filter((m) => m.boardStop.id === stop.id),
      alighting: manifest.filter((m) => m.alightStop.id === stop.id).length,
    }))
    .filter((group) => group.riders.length > 0 || group.alighting > 0);

  return (
    <div className="space-y-5">
      <header>
        <Link href="/drive" className="text-xs text-faint transition-colors hover:text-body">
          ← My runs
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="tabular text-3xl font-semibold tracking-tight text-body">
            {trip.trip.departTime}
          </h1>
          <span className="text-base text-body">
            <span className="tabular text-brand-bright">{trip.route.code}</span> {trip.route.name}
          </span>
          <DirectionBadge direction={trip.trip.direction} />
          <TripStatusBadge status={status} />
          {trip.trip.delayMinutes > 0 ? (
            <Badge tone="flame">{trip.trip.delayMinutes} min late</Badge>
          ) : null}
        </div>

        <p className="mt-2 text-sm text-muted">
          {formatServiceDate(trip.trip.serviceDate)} · {trip.vehicle.plate} · {trip.vehicle.model} ·{" "}
          {trip.timetable[0].name} → {trip.timetable[trip.timetable.length - 1].name}
        </p>

        {status === "cancelled" ? (
          <p className="mt-3 rounded-xl bg-flame-soft px-4 py-3 text-sm text-flame">
            Control cancelled this run{trip.trip.cancelReason ? ` — ${trip.trip.cancelReason}` : ""}.
            Every rider has been told.
          </p>
        ) : null}
      </header>

      <section className="grid grid-cols-3 gap-3">
        <Stat label="On board" value={boarded.length} tone="brand" />
        <Stat label="Expected" value={waiting.length} tone={waiting.length > 0 ? "amber" : "neutral"} />
        <Stat label="Seats" value={`${manifest.length}/${trip.trip.capacity}`} />
      </section>

      {!finished ? (
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-body">Run state</h2>
            <span className="tabular text-xs text-faint">
              {relativeMinutes((trip.departsAt.getTime() - Date.now()) / 60000)}
            </span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <form action={openBoardingAction}>
              <input type="hidden" name="tripId" value={trip.trip.id} />
              <button
                type="submit"
                disabled={status === "boarding"}
                className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                  status === "boarding"
                    ? "cursor-default bg-amber-soft text-amber"
                    : "border border-edge text-muted hover:text-body"
                }`}
              >
                {status === "boarding" ? "Boarding open" : "Open boarding"}
              </button>
            </form>

            <form action={startRunAction}>
              <input type="hidden" name="tripId" value={trip.trip.id} />
              <button
                type="submit"
                disabled={running}
                className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                  running
                    ? "cursor-default bg-brand-soft text-brand-bright"
                    : "bg-brand text-ink hover:bg-brand-bright"
                }`}
              >
                {running ? "On the road" : "Start the run"}
              </button>
            </form>

            <form action={endRunAction}>
              <input type="hidden" name="tripId" value={trip.trip.id} />
              <button
                type="submit"
                className="w-full rounded-xl border border-edge px-4 py-3 text-sm font-semibold text-muted transition-colors hover:border-flame/60 hover:text-flame"
              >
                End the run
              </button>
            </form>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            Ending the run marks anyone who never scanned as a no-show and closes the departure.
          </p>

          <div className="mt-4 border-t border-line pt-4">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Running late?</span>
              <span className="tabular">{trip.trip.delayMinutes} min reported</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[0, 5, 10, 15, 30, 45].map((minutes) => (
                <form key={minutes} action={setDelayAction}>
                  <input type="hidden" name="tripId" value={trip.trip.id} />
                  <input type="hidden" name="delayMinutes" value={minutes} />
                  <button
                    type="submit"
                    className={`tabular rounded-lg border px-3.5 py-2 text-xs transition-colors ${
                      trip.trip.delayMinutes === minutes
                        ? "border-brand/60 bg-brand-soft text-brand-bright"
                        : "border-edge text-muted hover:text-body"
                    }`}
                  >
                    {minutes === 0 ? "On time" : `+${minutes}`}
                  </button>
                </form>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-faint">
              Riders waiting further down the line see this straight away.
            </p>
          </div>
        </Card>
      ) : null}

      {!finished ? (
        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-body">Check a rider in</h2>
          <p className="mt-1 text-xs text-faint">
            Six characters from their pass. No vowels, no zero, no one.
          </p>
          <div className="mt-4">
            <BoardingForm tripId={trip.trip.id} />
          </div>

          <div className="mt-4 border-t border-line pt-3">
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
      ) : null}

      <Card>
        <CardHeader
          title="Stages"
          subtitle="Call each stage as you reach it — it keeps the delay honest by itself"
        />
        <div className="divide-y divide-line">
          {trip.timetable.map((stop) => {
            const arrivedAt = arrivals.get(stop.id);
            const group = byStop.find((g) => g.stop.id === stop.id);
            const boardingHere = group?.riders.length ?? 0;
            const alightingHere = group?.alighting ?? 0;

            return (
              <div key={stop.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                <span
                  className={`size-2.5 shrink-0 rounded-full ${
                    arrivedAt ? "bg-brand" : "bg-edge"
                  }`}
                />
                <div className="min-w-[9rem] flex-1">
                  <p className="text-sm font-medium text-body">{stop.name}</p>
                  <p className="text-xs text-faint">
                    {boardingHere} on · {alightingHere} off
                  </p>
                </div>
                <span className="tabular shrink-0 text-sm text-brand-bright">{stop.time}</span>

                {arrivedAt ? (
                  <Badge tone="brand">called {NAIROBI_CLOCK.format(new Date(arrivedAt))}</Badge>
                ) : finished ? null : (
                  <form action={markArrivedAction} className="shrink-0">
                    <input type="hidden" name="tripId" value={trip.trip.id} />
                    <input type="hidden" name="stopId" value={stop.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted transition-colors hover:border-brand/60 hover:text-brand-bright"
                    >
                      Arrived
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {manifest.length === 0 ? (
        <EmptyState
          title="Nobody booked"
          body="No seats were sold on this run, so there is nothing to check in."
        />
      ) : (
        <div className="space-y-4">
          {byStop
            .filter((group) => group.riders.length > 0)
            .map(({ stop, riders }) => (
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
                    <Badge
                      tone={
                        riders.every((r) => r.booking.status === "boarded") ? "brand" : "amber"
                      }
                    >
                      {riders.filter((r) => r.booking.status === "boarded").length} / {riders.length}
                    </Badge>
                  }
                />
                <ul className="divide-y divide-line">
                  {riders.map((entry) => (
                    <li
                      key={entry.booking.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:px-5"
                    >
                      <span className="tabular w-8 shrink-0 text-base font-semibold text-body">
                        {entry.booking.seatNo}
                      </span>
                      <div className="min-w-[10rem] flex-1">
                        <p
                          className={`text-sm ${
                            entry.booking.status === "boarded" ? "text-faint" : "text-body"
                          }`}
                        >
                          {entry.employee.name}
                        </p>
                        <p className="text-xs text-faint">
                          {entry.companyName} · off at {entry.alightStop.name}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-xs tracking-widest text-muted">
                        {entry.booking.passCode}
                      </span>
                      <BookingStatusBadge status={entry.booking.status} />
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
        </div>
      )}

      {!finished ? (
        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-body">Report a problem</h2>
          <p className="mt-1 text-xs leading-relaxed text-faint">
            Goes straight to control. Adding minutes here also updates what riders see.
          </p>
          <ActionForm
            action={reportIncidentAction}
            submit="Send to control"
            resetOnSuccess
            className="mt-4 space-y-3"
          >
            <input type="hidden" name="tripId" value={trip.trip.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="What happened"
                name="kind"
                options={[
                  { value: "traffic", label: "Traffic" },
                  { value: "breakdown", label: "Breakdown" },
                  { value: "accident", label: "Accident" },
                  { value: "security", label: "Security" },
                  { value: "weather", label: "Weather" },
                  { value: "other", label: "Something else" },
                ]}
              />
              <Field
                label="Delay it adds (minutes)"
                name="delayMinutes"
                type="number"
                min={0}
                max={240}
                defaultValue={0}
              />
            </div>
            <TextAreaField
              label="What control needs to know"
              name="note"
              rows={2}
              required
              placeholder="Stuck at Githurai, matatu broken down across two lanes"
            />
          </ActionForm>

          {incidents.length > 0 ? (
            <ul className="mt-5 space-y-2 border-t border-line pt-4">
              {incidents.map((incident) => (
                <li key={incident.id} className="flex items-start gap-3 text-xs">
                  <Badge tone={incident.resolvedAt ? "neutral" : "amber"}>
                    {incident.resolvedAt ? "resolved" : "open"}
                  </Badge>
                  <span className="flex-1 text-muted">{incident.note}</span>
                  {incident.delayMinutes > 0 ? (
                    <span className="tabular shrink-0 text-flame">+{incident.delayMinutes}m</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
