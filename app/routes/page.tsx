import Link from "next/link";

import { ArrowIcon, RouteIcon } from "@/components/icons";
import { Card, EmptyTab, Eyebrow, TabHead } from "@/components/rider";
import { getPrincipal } from "@/lib/auth";
import { fareForKm, formatKes } from "@/lib/domain/fares";
import { nextServiceDate } from "@/lib/domain/schedule";
import { addDays, formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { getRouteStops, liveRoutes, listRoutes } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Routes" };

/**
 * Tab 2 — Routes.
 *
 * Which lines are alive. A rider at a stage is not reading a timetable, they
 * are asking whether anything is coming, so a line with a bus actually moving
 * on it says so with a live dot and leads the list. Lines that have finished
 * for the day fall to the bottom rather than disappearing — knowing the last
 * one has gone is an answer too.
 *
 * Reachable signed out, where it doubles as the shop window for the network.
 */
export default async function RoutesPage() {
  const principal = await getPrincipal();
  const rider = principal?.kind === "employee";

  // Today, for as long as today still has a bus on it. Rolling straight to the
  // next service date would tell someone at 07:00 that the next bus is 05:30
  // tomorrow while one is pulling into their stage.
  const today = nairobiDate();
  const now = new Date();
  let serviceDate = today;
  let live = liveRoutes(serviceDate, now);
  if (live.every((r) => r.running === 0 && r.nextDepartTime === null)) {
    serviceDate = nextServiceDate(addDays(today, 1));
    live = liveRoutes(serviceDate, now);
  }
  const isToday = serviceDate === today;

  // Anything with a bus on the road first, then by how soon the next one goes.
  const ordered = [...live].sort((a, b) => {
    if (a.running !== b.running) return b.running - a.running;
    if (a.nextDepartTime && b.nextDepartTime) {
      return a.nextDepartTime.localeCompare(b.nextDepartTime);
    }
    if (a.nextDepartTime) return -1;
    if (b.nextDepartTime) return 1;
    return a.route.code.localeCompare(b.route.code);
  });

  const moving = ordered.reduce((sum, r) => sum + r.running, 0);
  const fares = new Map(
    listRoutes().map((route) => {
      const stops = getRouteStops(route.id);
      return [route.id, fareForKm(stops[stops.length - 1].kmFromStart)];
    }),
  );

  const body = (
    <>
      {ordered.length === 0 ? (
        <EmptyTab icon={<RouteIcon className="size-7" />} title="Nothing running">
          No line is in service on {formatServiceDate(serviceDate)}.
        </EmptyTab>
      ) : (
        <ul className="tab-enter space-y-3">
          {ordered.map((entry) => {
            const stops = getRouteStops(entry.route.id);
            const first = stops[0];
            const last = stops[stops.length - 1];
            const done = entry.nextDepartTime === null && entry.running === 0;

            return (
              <li key={entry.route.id}>
                <Link
                  href={`/routes/${entry.route.slug}`}
                  className={`block rounded-3xl border-2 bg-surface px-4 py-4 transition-colors hover:border-brand ${
                    done ? "border-edge opacity-60" : "border-edge"
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <span className="brand-wash tabular flex h-11 shrink-0 items-center rounded-2xl px-3 text-base font-bold text-white">
                      {entry.route.code}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-bold tracking-tight text-body">
                        {entry.route.name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted">
                        <span className="min-w-0 truncate">{first.name}</span>
                        <ArrowIcon className="size-3.5 shrink-0 text-faint" />
                        <span className="min-w-0 truncate">{last.name}</span>
                      </p>
                    </div>

                    {entry.running > 0 ? (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-sm font-bold text-accent">
                        <span
                          className="live-dot size-2 rounded-full bg-brand-bright"
                          aria-hidden="true"
                        />
                        {entry.running}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                    <span className="text-sm text-muted">
                      {entry.running > 0 ? (
                        <>
                          <span className="font-semibold text-accent">
                            {entry.running === 1 ? "1 bus" : `${entry.running} buses`} on the road
                          </span>
                          {entry.nextDepartTime ? ` · next leaves ${entry.nextDepartTime}` : ""}
                        </>
                      ) : entry.nextDepartTime ? (
                        <>
                          Next bus {isToday ? "at" : `${formatServiceDate(serviceDate)},`}{" "}
                          <span className="tabular font-semibold text-body">
                            {entry.nextDepartTime}
                          </span>
                        </>
                      ) : (
                        "Finished for today"
                      )}
                      {entry.worstDelayMinutes > 0
                        ? ` · running ${entry.worstDelayMinutes} min late`
                        : ""}
                    </span>
                    <span className="tabular shrink-0 text-sm text-faint">
                      up to {formatKes(fares.get(entry.route.id) ?? 0)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Card className="px-5 py-4">
        <Eyebrow>Fares</Eyebrow>
        <p className="mt-1.5 text-base leading-relaxed text-muted">
          You pay for the distance you actually travel on the line, not the whole route. No seat
          to choose — get on, and pay from the Pay tab.
        </p>
      </Card>
    </>
  );

  if (!rider) {
    // Signed out, this is the public network page and sits in the wide layout.
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-faint">
            {formatServiceDate(serviceDate)}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-body">The network</h1>
          <p className="mt-1.5 text-base text-muted">
            {ordered.length} lines across Nairobi
            {moving > 0 ? ` · ${moving} buses moving right now` : ""} · all times East Africa Time
          </p>
        </header>
        {body}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <TabHead
        eyebrow={
          moving > 0
            ? `${moving} buses moving now`
            : isToday
              ? "Nothing on the road"
              : formatServiceDate(serviceDate)
        }
        title="Lines running"
        action={
          <Link
            href="/ride"
            className="min-h-11 shrink-0 self-center rounded-xl border-2 border-edge px-3.5 text-sm font-semibold leading-[2.4rem] text-body transition-colors hover:border-brand hover:text-accent"
          >
            My commute
          </Link>
        }
      />
      {body}
    </div>
  );
}
