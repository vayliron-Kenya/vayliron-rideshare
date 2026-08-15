import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveIncidentAction } from "@/app/ops-actions";
import {
  Badge,
  Card,
  CardHeader,
  DirectionBadge,
  EmptyState,
  Meter,
  Stat,
  TripStatusBadge,
} from "@/components/ui";
import { getOperatorSession } from "@/lib/auth";
import { formatKes } from "@/lib/domain/fares";
import { nextServiceDate } from "@/lib/domain/schedule";
import { formatServiceDate, nairobiDate, relativeMinutes } from "@/lib/domain/time";
import { lineStatus, listIncidents, networkSnapshot } from "@/lib/ops";
import { listTrips } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Operations board" };

const INCIDENT_LABEL: Record<string, string> = {
  traffic: "Traffic",
  breakdown: "Breakdown",
  accident: "Accident",
  security: "Security",
  weather: "Weather",
  other: "Other",
};

export default async function OpsBoardPage() {
  const operator = await getOperatorSession();
  if (!operator) redirect("/");

  const today = nairobiDate();
  const serviceDate = nextServiceDate(today);
  const now = Date.now();

  const snapshot = networkSnapshot(serviceDate);
  const lines = lineStatus(serviceDate);
  const incidents = listIncidents({ openOnly: true, limit: 12 });

  const allTrips = listTrips({ serviceDate, includeCancelled: true });
  const running = allTrips
    .filter((t) => t.trip.status === "boarding" || t.trip.status === "in_transit")
    .sort((a, b) => a.departsAt.getTime() - b.departsAt.getTime());
  const next = allTrips
    .filter((t) => t.trip.status === "scheduled" && t.departsAt.getTime() > now)
    .sort((a, b) => a.departsAt.getTime() - b.departsAt.getTime())
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-faint">
            Vayliron control · {operator.name}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-body">
            Network board
          </h1>
          <p className="mt-1 text-sm text-muted">
            {formatServiceDate(serviceDate)}
            {serviceDate !== today ? " · next service day" : ""} · all times East Africa Time
          </p>
        </div>
        <Link
          href="/ops/trips"
          className="rounded-xl border border-edge px-4 py-2 text-sm text-muted transition-colors hover:text-body"
        >
          All departures →
        </Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Running now"
          value={snapshot.running}
          tone={snapshot.running > 0 ? "brand" : "neutral"}
          hint={`${snapshot.departures} departures scheduled today`}
        />
        <Stat
          label="Seats sold"
          value={`${snapshot.seatsSold.toLocaleString("en-KE")}`}
          hint={`${snapshot.loadPct}% of ${snapshot.seatsOffered.toLocaleString("en-KE")} offered`}
        />
        <Stat
          label="Fare revenue"
          value={formatKes(snapshot.revenueKes)}
          tone="brand"
          hint="Employer and rider shares combined"
        />
        <Stat
          label="Disruption"
          value={`${snapshot.openIncidents} open`}
          tone={snapshot.openIncidents > 0 ? "flame" : "neutral"}
          hint={
            snapshot.delayedRuns > 0
              ? `${snapshot.delayedRuns} runs late · worst ${snapshot.worstDelayMinutes} min`
              : snapshot.cancelled > 0
                ? `${snapshot.cancelled} cancelled today`
                : "Everything running to plan"
          }
        />
      </section>

      {incidents.length > 0 ? (
        <Card>
          <CardHeader
            title="Open incidents"
            subtitle="Raised by drivers or by control, newest first"
          />
          <div className="divide-y divide-line">
            {incidents.map(({ incident, trip, reporterName }) => (
              <div key={incident.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
                <Badge tone={incident.kind === "breakdown" || incident.kind === "accident" ? "flame" : "amber"}>
                  {INCIDENT_LABEL[incident.kind] ?? incident.kind}
                </Badge>

                <div className="min-w-[16rem] flex-1">
                  <p className="text-sm text-body">{incident.note}</p>
                  <p className="mt-0.5 text-xs text-faint">
                    {trip ? (
                      <>
                        <Link
                          href={`/ops/trips/${incident.tripId}`}
                          className="text-brand-bright transition-colors hover:underline"
                        >
                          {trip.route.code} {trip.trip.departTime}
                        </Link>{" "}
                        · {trip.vehicle.plate} ·{" "}
                      </>
                    ) : null}
                    reported by {reporterName}
                    {incident.delayMinutes > 0 ? ` · +${incident.delayMinutes} min delay` : ""}
                  </p>
                </div>

                <form action={resolveIncidentAction}>
                  <input type="hidden" name="incidentId" value={incident.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted transition-colors hover:border-brand/60 hover:text-brand-bright"
                  >
                    Mark resolved
                  </button>
                </form>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Running now"
          subtitle={
            running.length > 0
              ? `${running.length} buses boarding or on the road`
              : "Nothing on the road at the moment"
          }
        />
        {running.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Quiet right now"
              body="The next departures are listed below. This board updates whenever a driver or controller changes a run."
            />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {running.map((trip) => (
              <Link
                key={trip.trip.id}
                href={`/ops/trips/${trip.trip.id}`}
                className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4 transition-colors hover:bg-raised/50"
              >
                <div className="w-16 shrink-0">
                  <p className="tabular text-lg font-semibold text-body">{trip.trip.departTime}</p>
                  {trip.trip.delayMinutes > 0 ? (
                    <p className="tabular text-[11px] text-flame">+{trip.trip.delayMinutes} min</p>
                  ) : (
                    <p className="text-[11px] text-faint">on time</p>
                  )}
                </div>

                <div className="min-w-[12rem] flex-1">
                  <p className="text-sm font-medium text-body">
                    <span className="tabular text-brand-bright">{trip.route.code}</span>{" "}
                    {trip.route.name}
                  </p>
                  <p className="mt-0.5 text-xs text-faint">
                    {trip.vehicle.plate} · {trip.driver.name} · {trip.driver.phone}
                  </p>
                </div>

                <div className="w-32 shrink-0">
                  <p className="tabular text-xs text-muted">
                    {trip.seatsBooked} / {trip.trip.capacity}
                  </p>
                  <Meter
                    pct={(trip.seatsBooked / trip.trip.capacity) * 100}
                    className="mt-1.5"
                  />
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <DirectionBadge direction={trip.trip.direction} />
                  <TripStatusBadge status={trip.trip.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Lines today" subtitle="Load and revenue by corridor" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
                <th className="px-5 py-3 font-medium">Line</th>
                <th className="px-5 py-3 font-medium">Corridor</th>
                <th className="px-5 py-3 text-right font-medium">Departures</th>
                <th className="px-5 py-3 font-medium">Load</th>
                <th className="px-5 py-3 text-right font-medium">Revenue</th>
                <th className="px-5 py-3 font-medium">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((line) => (
                <tr key={line.routeId} className="text-muted">
                  <td className="whitespace-nowrap px-5 py-3">
                    <Link
                      href={`/ops/trips?route=${line.routeId}`}
                      className="transition-colors hover:text-brand-bright"
                    >
                      <span className="tabular text-brand-bright">{line.code}</span>{" "}
                      <span className="text-body">{line.name}</span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs">{line.corridor}</td>
                  <td className="tabular px-5 py-3 text-right">
                    {line.departures}
                    {line.cancelled > 0 ? (
                      <span className="ml-1 text-flame">−{line.cancelled}</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Meter
                        pct={line.loadPct}
                        tone={line.loadPct >= 85 ? "flame" : line.loadPct >= 60 ? "amber" : "brand"}
                        className="w-28"
                      />
                      <span className="tabular text-xs">{line.loadPct}%</span>
                    </div>
                  </td>
                  <td className="tabular whitespace-nowrap px-5 py-3 text-right text-body">
                    {formatKes(line.revenueKes)}
                  </td>
                  <td className="px-5 py-3">
                    {line.running > 0 ? (
                      <Badge tone="brand">{line.running} running</Badge>
                    ) : line.worstDelayMinutes > 0 ? (
                      <Badge tone="amber">up to {line.worstDelayMinutes} min late</Badge>
                    ) : (
                      <Badge>on plan</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {next.length > 0 ? (
        <Card>
          <CardHeader title="Next out" subtitle="The eight departures closest to leaving" />
          <div className="divide-y divide-line">
            {next.map((trip) => (
              <Link
                key={trip.trip.id}
                href={`/ops/trips/${trip.trip.id}`}
                className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 text-sm transition-colors hover:bg-raised/50"
              >
                <span className="tabular w-14 shrink-0 font-medium text-body">
                  {trip.trip.departTime}
                </span>
                <span className="tabular w-14 shrink-0 text-brand-bright">{trip.route.code}</span>
                <span className="min-w-[10rem] flex-1 truncate text-muted">
                  {trip.timetable[0].name} → {trip.timetable[trip.timetable.length - 1].name}
                </span>
                <span className="tabular shrink-0 text-xs text-faint">
                  {trip.seatsBooked}/{trip.trip.capacity} sold
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {relativeMinutes((trip.departsAt.getTime() - now) / 60000)}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
