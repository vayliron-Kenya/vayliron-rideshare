import Link from "next/link";

import { ArrowIcon, RouteIcon } from "@/components/icons";
import { Card, EmptyTab, Eyebrow, Screen } from "@/components/rider";
import { getPrincipal } from "@/lib/auth";
import { fareForKm, formatKes } from "@/lib/domain/fares";
import { nextServiceDate } from "@/lib/domain/schedule";
import { addDays, formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { getRouteStops, liveRoutes, type LiveRoute } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Buses" };

/**
 * Tab 2 — Buses.
 *
 * Which buses are out. A rider at a stop is not reading a timetable, they are
 * asking whether anything is coming, so a line with a bus actually moving on
 * it glows and leads the list. Lines that have finished for the day sink to
 * the bottom rather than vanishing — knowing the last one has gone is an
 * answer too.
 *
 * The list is the screen: it fills whatever height is left and scrolls inside
 * its own pane, so the page around it never moves.
 *
 * Reachable signed out, where it doubles as the shop window for the network.
 */
export default async function BusesPage() {
  const principal = await getPrincipal();
  const rider = principal?.kind === "employee";

  // Today, for as long as today still has a bus on it. Rolling straight to the
  // next service date would tell someone at 07:00 that the next bus is 05:30
  // tomorrow while one is pulling into their stop.
  const today = nairobiDate();
  const now = new Date();
  let serviceDate = today;
  let live = liveRoutes(serviceDate, now);
  if (live.every((r) => r.running === 0 && r.nextDepartTime === null)) {
    serviceDate = nextServiceDate(addDays(today, 1));
    live = liveRoutes(serviceDate, now);
  }
  const isToday = serviceDate === today;

  // Anything on the road first, then by how soon the next one goes.
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
  const ends = new Map(
    ordered.map((entry) => {
      const stops = getRouteStops(entry.route.id);
      return [
        entry.route.id,
        {
          from: stops[0].name,
          to: stops[stops.length - 1].name,
          topFare: fareForKm(stops[stops.length - 1].kmFromStart),
        },
      ];
    }),
  );

  const list =
    ordered.length === 0 ? (
      <EmptyTab icon={<RouteIcon className="size-8" />} title="Nothing running">
        No bus is out on {formatServiceDate(serviceDate)}.
      </EmptyTab>
    ) : (
      <Card grow className="overflow-hidden">
        <ul className="inner-scroll flex-1 divide-y divide-[var(--glass-edge)] p-1.5">
          {ordered.map((entry) => (
            <li key={entry.route.id}>
              <BusRow
                entry={entry}
                isToday={isToday}
                serviceDate={serviceDate}
                ends={ends.get(entry.route.id)!}
              />
            </li>
          ))}
        </ul>
      </Card>
    );

  if (!rider) {
    // Signed out, this is the public network page in the flowing layout.
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <header>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-faint">
            {formatServiceDate(serviceDate)}
          </p>
          <h1 className="mt-0.5 text-3xl font-bold tracking-tight text-body">The network</h1>
          <p className="mt-1.5 text-base text-muted">
            {ordered.length} bus lines across Nairobi
            {moving > 0 ? ` · ${moving} out on the road right now` : ""}
          </p>
        </header>
        <div className="glass rounded-[1.4rem]">
          <ul className="divide-y divide-[var(--glass-edge)] p-1.5">
            {ordered.map((entry) => (
              <li key={entry.route.id}>
                <BusRow
                entry={entry}
                isToday={isToday}
                serviceDate={serviceDate}
                ends={ends.get(entry.route.id)!}
              />
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <Screen
      eyebrow={isToday ? "Right now" : formatServiceDate(serviceDate)}
      title={moving > 0 ? `${moving} on the road` : "Next buses"}
      action={
        <Link
          href="/ride"
          className="glass min-h-11 shrink-0 self-center rounded-2xl px-3.5 text-sm font-bold leading-[2.6rem] text-body transition-colors hover:text-accent"
        >
          My route
        </Link>
      }
    >
      {list}
      <Card className="px-4 py-3">
        <Eyebrow>What you pay</Eyebrow>
        <p className="mt-1 text-base leading-relaxed text-muted">
          Only for the distance you ride. No seat to pick — get on, sit down, pay on the Pay tab.
        </p>
      </Card>
    </Screen>
  );
}

function BusRow({
  entry,
  isToday,
  serviceDate,
  ends,
}: {
  entry: LiveRoute;
  isToday: boolean;
  serviceDate: string;
  ends: { from: string; to: string; topFare: number };
}) {
  const done = entry.nextDepartTime === null && entry.running === 0;
  const out = entry.running > 0;

  return (
    <Link
      href={`/routes/${entry.route.slug}`}
      className={`flex items-center gap-3 rounded-2xl px-2.5 py-3 transition-colors hover:bg-[var(--glass-sheen)] ${
        done ? "opacity-50" : ""
      }`}
    >
      <span
        className={`tabular flex h-11 w-14 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
          out ? "brand-wash glow text-white" : "glass text-body"
        }`}
      >
        {entry.route.code.replace("VL-", "")}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[0.95rem] font-bold text-body">
          <span className="min-w-0 truncate">{ends.from}</span>
          <ArrowIcon className="size-3.5 shrink-0 text-faint" />
          <span className="min-w-0 truncate">{ends.to}</span>
        </span>
        <span className="mt-0.5 block truncate text-sm text-muted">
          {out ? (
            <span className="font-semibold text-accent">
              {entry.running === 1 ? "1 on the road now" : `${entry.running} on the road now`}
            </span>
          ) : entry.nextDepartTime ? (
            <>
              Next <span className="tabular font-semibold text-body">{entry.nextDepartTime}</span>
            </>
          ) : (
            "Done for today"
          )}
          {" · up to "}
          <span className="tabular">{formatKes(ends.topFare)}</span>
          {entry.worstDelayMinutes > 0 ? ` · ${entry.worstDelayMinutes} min late` : ""}
        </span>
      </span>

      {out ? (
        <span
          className="live-dot size-2.5 shrink-0 rounded-full bg-brand-bright"
          aria-hidden="true"
        />
      ) : null}
    </Link>
  );
}
