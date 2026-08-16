import Link from "next/link";

import { ArrowIcon } from "@/components/icons";
import { fareForKm, formatKes } from "@/lib/domain/fares";
import { nextServiceDate, timetableFor } from "@/lib/domain/schedule";
import { formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { getRouteStops, listRoutes } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Routes" };

/**
 * The whole network, one card per line.
 *
 * This page is reachable signed out, so it is the app's shop window as much as
 * a rider tool: each line leads with its code set large in the brand gradient,
 * then the two ends of the run, then the three numbers anyone actually asks
 * about — how far, how long, how much.
 */
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
    <div className="space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-faint">
          {formatServiceDate(serviceDate)}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-body">The network</h1>
        <p className="mt-1.5 text-base text-muted">
          {routes.length} lines across Nairobi · {departuresPerDay} departures a day on each ·
          all times East Africa Time
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {routes.map(({ route, stops, totalKm, freeFlowMin, endToEndFare }) => (
          <Link
            key={route.id}
            href={`/routes/${route.slug}`}
            className="group flex flex-col rounded-3xl border-2 border-edge bg-surface p-5 transition-colors hover:border-brand"
          >
            <div className="flex items-start gap-3.5">
              <span className="brand-wash tabular flex h-12 shrink-0 items-center rounded-2xl px-3.5 text-lg font-bold text-white">
                {route.code}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-bold tracking-tight text-body">
                  {route.name}
                </h2>
                <p className="truncate text-sm text-muted">{route.corridor}</p>
              </div>
            </div>

            <p className="mt-3.5 flex items-center gap-2 text-base font-semibold text-body">
              <span className="min-w-0 truncate">{stops[0].name}</span>
              <ArrowIcon className="size-4 shrink-0 text-faint" />
              <span className="min-w-0 truncate">{stops[stops.length - 1].name}</span>
            </p>
            <p className="mt-1 truncate text-sm text-muted">
              {stops.length} stages · via {stops.slice(1, -1).map((s) => s.name).join(", ")}
            </p>

            <p className="mt-3 text-sm leading-relaxed text-muted">{route.blurb}</p>

            <dl className="mt-auto grid grid-cols-3 gap-3 border-t border-line pt-4">
              <Fact label="End to end" value={`${totalKm} km`} />
              <Fact label="Free-flow" value={`${freeFlowMin} min`} />
              <Fact label="Full fare" value={formatKes(endToEndFare)} />
            </dl>

            <p className="mt-4 text-sm font-semibold text-accent">See the timetable →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-faint">{label}</dt>
      <dd className="tabular mt-1 text-lg font-bold text-body">{value}</dd>
    </div>
  );
}
