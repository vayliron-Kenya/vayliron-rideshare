import Link from "next/link";

import { Badge, Card } from "@/components/ui";
import { fareForKm, formatKes } from "@/lib/domain/fares";
import { nextServiceDate, timetableFor } from "@/lib/domain/schedule";
import { formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { getRouteStops, listRoutes } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Routes" };

export default function RoutesPage() {
  const today = nairobiDate();
  const serviceDate = nextServiceDate(today);
  const departuresPerDay = timetableFor(serviceDate, "inbound").length * 2;

  const routes = listRoutes().map((route) => {
    const stops = getRouteStops(route.id);
    const last = stops[stops.length - 1];
    return {
      route,
      stops,
      totalKm: last.kmFromStart,
      freeFlowMin: last.minFromStart,
      endToEndFare: fareForKm(last.kmFromStart),
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-body">The network</h1>
        <p className="mt-1 text-sm text-muted">
          {routes.length} lines · {departuresPerDay} departures per line on{" "}
          {formatServiceDate(serviceDate)} · all times East Africa Time
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {routes.map(({ route, stops, totalKm, freeFlowMin, endToEndFare }) => (
          <Card key={route.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="tabular text-sm font-semibold text-accent">
                    {route.code}
                  </span>
                  <h2 className="text-base font-semibold text-body">{route.name}</h2>
                </div>
                <p className="mt-0.5 text-xs text-faint">{route.corridor}</p>
              </div>
              <Badge>{stops.length} stages</Badge>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-muted">{route.blurb}</p>

            <ol className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
              {stops.map((stop, index) => (
                <li key={stop.id} className="flex items-center gap-1.5">
                  <span
                    className={`text-xs ${
                      index === 0 || index === stops.length - 1
                        ? "font-medium text-body"
                        : "text-faint"
                    }`}
                  >
                    {stop.name}
                  </span>
                  {index < stops.length - 1 ? (
                    <span className="text-[10px] text-edge">→</span>
                  ) : null}
                </li>
              ))}
            </ol>

            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-faint">End to end</dt>
                <dd className="tabular mt-0.5 text-sm font-medium text-body">{totalKm} km</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-faint">Free-flow</dt>
                <dd className="tabular mt-0.5 text-sm font-medium text-body">{freeFlowMin} min</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-faint">Full fare</dt>
                <dd className="tabular mt-0.5 text-sm font-medium text-body">
                  {formatKes(endToEndFare)}
                </dd>
              </div>
            </dl>

            <Link
              href={`/routes/${route.slug}`}
              className="mt-4 inline-flex w-fit rounded-lg border border-edge px-3 py-1.5 text-xs text-muted transition-colors hover:border-brand/60 hover:text-accent"
            >
              Timetable &amp; seats →
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
