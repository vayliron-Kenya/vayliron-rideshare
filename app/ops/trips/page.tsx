import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge, Card, CardHeader, EmptyState, Meter, TripStatusBadge } from "@/components/ui";
import { getOperatorSession } from "@/lib/auth";
import { nextServiceDate } from "@/lib/domain/schedule";
import { addDays, formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { listRoutes, listTrips } from "@/lib/queries";
import type { Direction, Trip } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Departures" };

const STATUSES: { value: string; label: string }[] = [
  { value: "", label: "All states" },
  { value: "scheduled", label: "Scheduled" },
  { value: "boarding", label: "Boarding" },
  { value: "in_transit", label: "On the road" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

interface PageProps {
  searchParams: Promise<{
    date?: string;
    route?: string;
    status?: string;
    direction?: string;
  }>;
}

export default async function OpsTripsPage({ searchParams }: PageProps) {
  const operator = await getOperatorSession();
  if (!operator) redirect("/");

  const query = await searchParams;
  const today = nairobiDate();
  const serviceDate = query.date ?? nextServiceDate(today);
  const routes = listRoutes();

  const direction =
    query.direction === "inbound" || query.direction === "outbound"
      ? (query.direction as Direction)
      : undefined;
  const status = STATUSES.some((s) => s.value && s.value === query.status)
    ? (query.status as Trip["status"])
    : undefined;

  const trips = listTrips({
    serviceDate,
    routeId: query.route || undefined,
    direction,
    status,
    includeCancelled: true,
  }).sort((a, b) => a.departsAt.getTime() - b.departsAt.getTime());

  const dates: string[] = [];
  for (let offset = -1; dates.length < 8; offset += 1) {
    const candidate = addDays(today, offset);
    if (offset < 0 || nextServiceDate(candidate) === candidate) dates.push(candidate);
  }

  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      date: serviceDate,
      route: query.route ?? "",
      status: query.status ?? "",
      direction: query.direction ?? "",
      ...patch,
    };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    return `/ops/trips?${next}`;
  };

  const sold = trips.reduce((sum, t) => sum + t.seatsBooked, 0);
  const offered = trips
    .filter((t) => t.trip.status !== "cancelled")
    .reduce((sum, t) => sum + t.trip.capacity, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-body">Departures</h1>
        <p className="mt-1 text-sm text-muted">
          {formatServiceDate(serviceDate)} · {trips.length} matching · {sold.toLocaleString("en-KE")}{" "}
          of {offered.toLocaleString("en-KE")} seats sold
        </p>
      </header>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {dates.map((date) => (
            <Link
              key={date}
              href={href({ date })}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                date === serviceDate
                  ? "border-brand/60 bg-brand-soft text-accent"
                  : "border-edge text-muted hover:text-body"
              }`}
            >
              {date === today ? "Today" : formatServiceDate(date)}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Link
            href={href({ route: "" })}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              !query.route
                ? "border-brand/60 bg-brand-soft text-accent"
                : "border-edge text-muted hover:text-body"
            }`}
          >
            All lines
          </Link>
          {routes.map((route) => (
            <Link
              key={route.id}
              href={href({ route: route.id })}
              className={`tabular rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                query.route === route.id
                  ? "border-brand/60 bg-brand-soft text-accent"
                  : "border-edge text-muted hover:text-body"
              }`}
            >
              {route.code}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((option) => (
            <Link
              key={option.value || "all"}
              href={href({ status: option.value })}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                (query.status ?? "") === option.value
                  ? "border-brand/60 bg-brand-soft text-accent"
                  : "border-edge text-muted hover:text-body"
              }`}
            >
              {option.label}
            </Link>
          ))}
          <span className="mx-1 w-px bg-edge" />
          {[
            { value: "", label: "Both ways" },
            { value: "inbound", label: "→ To work" },
            { value: "outbound", label: "← To home" },
          ].map((option) => (
            <Link
              key={option.value || "both"}
              href={href({ direction: option.value })}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                (query.direction ?? "") === option.value
                  ? "border-brand/60 bg-brand-soft text-accent"
                  : "border-edge text-muted hover:text-body"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Board" subtitle="Open a departure to reassign, delay or cancel it" />
        {trips.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nothing matches"
              body="No departures fit those filters. Widen the date or clear the line filter."
            />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {trips.map((trip) => (
              <Link
                key={trip.trip.id}
                href={`/ops/trips/${trip.trip.id}`}
                className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3.5 transition-colors hover:bg-raised/50"
              >
                <div className="w-16 shrink-0">
                  <p className="tabular text-base font-semibold text-body">
                    {trip.trip.departTime}
                  </p>
                  {trip.trip.delayMinutes > 0 ? (
                    <p className="tabular text-[11px] text-flame">+{trip.trip.delayMinutes} min</p>
                  ) : null}
                </div>

                <div className="min-w-[13rem] flex-1">
                  <p className="text-sm text-body">
                    <span className="tabular text-accent">{trip.route.code}</span>{" "}
                    {trip.timetable[0].name} → {trip.timetable[trip.timetable.length - 1].name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-faint">
                    {trip.vehicle.plate} · {trip.vehicle.model} · {trip.driver.name}
                    {trip.trip.cancelReason ? ` · ${trip.trip.cancelReason}` : ""}
                  </p>
                </div>

                <div className="w-28 shrink-0">
                  <p className="tabular text-xs text-muted">
                    {trip.seatsBooked} / {trip.trip.capacity}
                  </p>
                  <Meter
                    pct={(trip.seatsBooked / trip.trip.capacity) * 100}
                    tone={trip.seatsBooked / trip.trip.capacity >= 0.85 ? "flame" : "brand"}
                    className="mt-1.5"
                  />
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {trip.trip.direction === "inbound" ? (
                    <Badge tone="sky">→</Badge>
                  ) : (
                    <Badge tone="amber">←</Badge>
                  )}
                  <TripStatusBadge status={trip.trip.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
