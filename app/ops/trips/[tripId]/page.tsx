import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  cancelTripAction,
  opsSetDelayAction,
  reassignAction,
  reinstateTripAction,
  resolveIncidentAction,
} from "@/app/ops-actions";
import { ActionForm, SelectField, TextAreaField } from "@/components/action-form";
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
import { getNetworkAdmin, getOperatorSession } from "@/lib/auth";
import { formatKes } from "@/lib/domain/fares";
import { formatServiceDate, relativeMinutes } from "@/lib/domain/time";
import { listDrivers, listFleet, tripIncidents, tripStopEvents } from "@/lib/ops";
import { getTrip, tripManifest } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ tripId: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const trip = getTrip((await params).tripId);
  return { title: trip ? `Control · ${trip.route.code} ${trip.trip.departTime}` : "Departure" };
}

const INCIDENT_LABEL: Record<string, string> = {
  traffic: "Traffic",
  breakdown: "Breakdown",
  accident: "Accident",
  security: "Security",
  weather: "Weather",
  other: "Other",
};

export default async function OpsTripPage({ params }: PageProps) {
  const operator = await getOperatorSession();
  if (!operator) redirect("/");
  const canEditFleet = Boolean(await getNetworkAdmin());

  const { tripId } = await params;
  const trip = getTrip(tripId);
  if (!trip) notFound();

  const manifest = tripManifest(tripId);
  const incidents = tripIncidents(tripId);
  const arrivals = new Map(tripStopEvents(tripId).map((e) => [e.stopId, e.arrivedAt]));

  const fleet = listFleet(trip.trip.serviceDate);
  const drivers = listDrivers(trip.trip.serviceDate).filter((d) => d.active === 1);

  const revenue = manifest.reduce((sum, m) => sum + m.booking.fareKes, 0);
  const boarded = manifest.filter((m) => m.booking.status === "boarded").length;
  const cancelled = trip.trip.status === "cancelled";
  const finished = cancelled || trip.trip.status === "completed";

  const companies = new Map<string, number>();
  for (const entry of manifest) {
    companies.set(entry.companyName, (companies.get(entry.companyName) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href="/ops/trips" className="text-xs text-faint transition-colors hover:text-body">
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
          {trip.trip.delayMinutes > 0 ? (
            <Badge tone="flame">running {trip.trip.delayMinutes} min late</Badge>
          ) : null}
        </div>

        <p className="mt-2 text-sm text-muted">
          {formatServiceDate(trip.trip.serviceDate)} · {trip.vehicle.plate} · {trip.vehicle.model} ·{" "}
          {trip.driver.name} · {trip.driver.phone} · traffic factor ×{trip.peakFactor.toFixed(2)}
        </p>

        {cancelled && trip.trip.cancelReason ? (
          <p className="mt-3 rounded-lg bg-flame-soft px-4 py-2.5 text-sm text-flame">
            Cancelled — {trip.trip.cancelReason}
          </p>
        ) : null}
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Seats sold" value={`${manifest.length} / ${trip.trip.capacity}`} />
        <Stat label="Boarded" value={boarded} tone="brand" />
        <Stat label="Fare revenue" value={formatKes(revenue)} />
        <Stat
          label="Clients on board"
          value={companies.size}
          hint={[...companies.entries()].map(([name, n]) => `${name} ${n}`).join(" · ") || "None"}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Stage progress"
              subtitle="Times shift with the reported delay; a called stage shows its actual time"
            />
            <ol className="p-5">
              {trip.timetable.map((stop, index) => {
                const arrivedAt = arrivals.get(stop.id);
                const boardingHere = manifest.filter((m) => m.boardStop.id === stop.id).length;
                const isLast = index === trip.timetable.length - 1;

                return (
                  <li key={stop.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span
                        className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                          arrivedAt ? "bg-brand" : "bg-edge ring-2 ring-surface"
                        }`}
                      />
                      {!isLast ? <span className="my-0.5 w-px flex-1 bg-edge" /> : null}
                    </div>
                    <div className={isLast ? "pb-0" : "pb-5"}>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <p className="text-sm font-medium text-body">{stop.name}</p>
                        <span className="tabular text-xs text-brand-bright">{stop.time}</span>
                        {arrivedAt ? (
                          <Badge tone="brand">
                            called{" "}
                            {new Intl.DateTimeFormat("en-GB", {
                              timeZone: "Africa/Nairobi",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            }).format(new Date(arrivedAt))}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-faint">
                        {stop.landmark} · {boardingHere} boarding here
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card>
            <CardHeader
              title="Manifest"
              subtitle={`${manifest.length} riders · ${boarded} checked in`}
              action={<Meter pct={manifest.length === 0 ? 0 : (boarded / manifest.length) * 100} className="w-24" />}
            />
            {manifest.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No seats sold"
                  body="Nothing is booked on this departure yet."
                />
              </div>
            ) : (
              <div className="max-h-[26rem] overflow-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
                      <th className="px-5 py-2.5 font-medium">Seat</th>
                      <th className="px-5 py-2.5 font-medium">Rider</th>
                      <th className="px-5 py-2.5 font-medium">Client</th>
                      <th className="px-5 py-2.5 font-medium">Leg</th>
                      <th className="px-5 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {manifest.map((entry) => (
                      <tr key={entry.booking.id} className="text-muted">
                        <td className="tabular px-5 py-2.5 font-medium text-body">
                          {entry.booking.seatNo}
                        </td>
                        <td className="px-5 py-2.5">
                          <span className="text-body">{entry.employee.name}</span>
                          <span className="ml-2 text-xs text-faint">{entry.employee.phone}</span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-xs">
                          {entry.companyName}
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-xs">
                          {entry.boardStop.name} → {entry.alightStop.name}
                        </td>
                        <td className="px-5 py-2.5">
                          <BookingStatusBadge status={entry.booking.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {incidents.length > 0 ? (
            <Card>
              <CardHeader title="Incidents on this run" />
              <div className="divide-y divide-line">
                {incidents.map((incident) => (
                  <div key={incident.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                    <Badge tone={incident.resolvedAt ? "neutral" : "amber"}>
                      {INCIDENT_LABEL[incident.kind] ?? incident.kind}
                    </Badge>
                    <p className="min-w-[12rem] flex-1 text-sm text-muted">{incident.note}</p>
                    {incident.delayMinutes > 0 ? (
                      <span className="tabular text-xs text-flame">
                        +{incident.delayMinutes} min
                      </span>
                    ) : null}
                    {incident.resolvedAt ? (
                      <Badge>resolved</Badge>
                    ) : (
                      <form action={resolveIncidentAction}>
                        <input type="hidden" name="incidentId" value={incident.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-edge px-3 py-1 text-xs text-muted transition-colors hover:border-brand/60 hover:text-brand-bright"
                        >
                          Resolve
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4">
          {!finished ? (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-body">Running late?</h2>
              <p className="mt-1 text-xs leading-relaxed text-faint">
                Every rider on this run sees the new arrival times immediately.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[0, 5, 10, 15, 30].map((minutes) => (
                  <form key={minutes} action={opsSetDelayAction}>
                    <input type="hidden" name="tripId" value={trip.trip.id} />
                    <input type="hidden" name="delayMinutes" value={minutes} />
                    <button
                      type="submit"
                      className={`tabular rounded-lg border px-3 py-1.5 text-xs transition-colors ${
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
            </Card>
          ) : null}

          {!finished ? (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-body">Reassign</h2>
              <ActionForm action={reassignAction} submit="Reassign" className="mt-3 space-y-3">
                <input type="hidden" name="tripId" value={trip.trip.id} />
                <SelectField
                  label="Bus"
                  name="vehicleId"
                  includeBlank="Leave as is"
                  options={fleet.map((v) => ({
                    value: v.id,
                    label: `${v.plate} · ${v.model} · ${v.capacity} seats`,
                  }))}
                  hint={`A replacement must seat at least the ${manifest.length} already sold.`}
                />
                <SelectField
                  label="Driver"
                  name="driverId"
                  includeBlank="Leave as is"
                  options={drivers.map((d) => ({
                    value: d.id,
                    label: `${d.name} · ${d.runsToday} runs today`,
                  }))}
                />
              </ActionForm>
            </Card>
          ) : null}

          {cancelled ? (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-body">Reinstate</h2>
              <p className="mt-1 text-xs leading-relaxed text-faint">
                Puts the departure back on the board. Seats released by the cancellation stay
                released — riders have to rebook.
              </p>
              <form action={reinstateTripAction} className="mt-3">
                <input type="hidden" name="tripId" value={trip.trip.id} />
                <button
                  type="submit"
                  className="w-full rounded-xl border border-edge px-4 py-2.5 text-sm text-muted transition-colors hover:border-brand/60 hover:text-brand-bright"
                >
                  Put back on the board
                </button>
              </form>
            </Card>
          ) : trip.trip.status !== "completed" ? (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-flame">Cancel this departure</h2>
              <p className="mt-1 text-xs leading-relaxed text-faint">
                Releases all {manifest.length} sold {manifest.length === 1 ? "seat" : "seats"} and
                removes the trip from those riders&apos; accounts.
              </p>
              <ActionForm
                action={cancelTripAction}
                submit="Cancel departure"
                tone="flame"
                fullWidthSubmit
                className="mt-3"
              >
                <input type="hidden" name="tripId" value={trip.trip.id} />
                <TextAreaField
                  label="Reason"
                  name="reason"
                  required
                  rows={2}
                  placeholder="Breakdown on Mombasa Road, no replacement unit"
                />
              </ActionForm>
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-body">Unit</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Plate" value={trip.vehicle.plate} />
              <Row label="Model" value={trip.vehicle.model} />
              <Row label="Seats" value={String(trip.trip.capacity)} />
              <Row label="Operator" value={trip.vehicle.operator} />
              <Row label="Driver" value={trip.driver.name} />
              <Row label="PSV badge" value={trip.driver.psvLicence} />
              <Row label="Rating" value={`${(trip.driver.ratingBps / 1000).toFixed(1)}★`} />
            </dl>
            {!canEditFleet ? (
              <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-faint">
                Editing the fleet itself needs network admin rights.
              </p>
            ) : null}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-body">Timing</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Departs" value={trip.trip.departTime} />
              <Row
                label="Arrives"
                value={trip.timetable[trip.timetable.length - 1].time}
              />
              <Row
                label="Run time"
                value={`${trip.timetable[trip.timetable.length - 1].adjustedMin} min`}
              />
              <Row
                label="Departure"
                value={relativeMinutes((trip.departsAt.getTime() - Date.now()) / 60000)}
              />
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular text-right text-body">{value}</dd>
    </div>
  );
}
