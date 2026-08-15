import Link from "next/link";
import { notFound } from "next/navigation";

import { DepartureRow } from "@/components/departure-row";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { buildTimetable, nextServiceDate, timetableFor } from "@/lib/domain/schedule";
import { addDays, formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { getDirectionalStops, getRouteBySlug, listTrips } from "@/lib/queries";
import type { Direction } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string; direction?: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const route = getRouteBySlug((await params).slug);
  return { title: route ? `${route.code} ${route.name}` : "Route" };
}

export default async function RouteDetailPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;

  const route = getRouteBySlug(slug);
  if (!route) notFound();

  const direction: Direction = query.direction === "outbound" ? "outbound" : "inbound";
  const today = nairobiDate();
  const serviceDate = query.date ?? nextServiceDate(today);

  const stops = getDirectionalStops(route.id, direction);
  const departures = timetableFor(serviceDate, direction);
  const timetable = departures.length > 0 ? buildTimetable(stops, departures[0]) : [];
  const trips = listTrips({ serviceDate, routeId: route.id, direction });

  // Offer the next fortnight of service days as quick links.
  const dateOptions: string[] = [];
  for (let offset = 0; dateOptions.length < 7; offset += 1) {
    const candidate = nextServiceDate(addDays(today, offset));
    if (!dateOptions.includes(candidate)) dateOptions.push(candidate);
  }

  const href = (patch: { date?: string; direction?: Direction }) => {
    const next = new URLSearchParams();
    next.set("date", patch.date ?? serviceDate);
    next.set("direction", patch.direction ?? direction);
    return `/routes/${route.slug}?${next}`;
  };

  return (
    <div className="space-y-6">
      <header>
        <Link href="/routes" className="text-xs text-faint transition-colors hover:text-body">
          ← All routes
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="tabular rounded-lg bg-brand-soft px-2.5 py-1 text-sm font-semibold text-accent">
            {route.code}
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-body">{route.name}</h1>
          <Badge>{route.corridor}</Badge>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{route.blurb}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-edge p-1">
          {(["inbound", "outbound"] as Direction[]).map((option) => (
            <Link
              key={option}
              href={href({ direction: option })}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                direction === option
                  ? "bg-raised font-medium text-body"
                  : "text-muted hover:text-body"
              }`}
            >
              {option === "inbound" ? "→ To work" : "← To home"}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {dateOptions.map((date) => (
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
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader
            title="Stages in order"
            subtitle={
              departures.length > 0
                ? `Times shown for the ${departures[0]} departure`
                : "No service on this date"
            }
          />
          <ol className="p-5">
            {stops.map((stop, index) => {
              const entry = timetable[index];
              const isEnd = index === 0 || index === stops.length - 1;
              return (
                <li key={stop.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
                        isEnd ? "bg-brand" : "bg-edge ring-2 ring-surface"
                      }`}
                    />
                    {index < stops.length - 1 ? (
                      <span className="my-0.5 w-px flex-1 bg-edge" />
                    ) : null}
                  </div>
                  <div className={`pb-5 ${index === stops.length - 1 ? "pb-0" : ""}`}>
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p
                        className={`text-sm ${isEnd ? "font-semibold text-body" : "font-medium text-body"}`}
                      >
                        {stop.name}
                      </p>
                      {entry ? (
                        <span className="tabular text-xs text-accent">{entry.time}</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-faint">
                      {stop.landmark} · {stop.area}
                    </p>
                    <p className="tabular mt-0.5 text-[11px] text-edge">
                      {stop.kmFromStart} km from origin
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        <Card>
          <CardHeader
            title={`Departures · ${formatServiceDate(serviceDate)}`}
            subtitle={`${trips.length} scheduled ${direction === "inbound" ? "towards work" : "towards home"}`}
          />
          {trips.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No departures on this date"
                body="Vayliron runs Monday to Saturday. Pick another service day above."
              />
            </div>
          ) : (
            <div>
              {trips.map((trip) => (
                <DepartureRow key={trip.trip.id} trip={trip} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
