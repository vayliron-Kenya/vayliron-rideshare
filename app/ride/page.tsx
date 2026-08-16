import Link from "next/link";
import { redirect } from "next/navigation";

import { ArrowIcon, CheckIcon, RouteIcon } from "@/components/icons";
import { Card, CrowdBar, DirectionChip, EmptyTab, Eyebrow, TabHead } from "@/components/rider";
import { getSession } from "@/lib/auth";
import { nextDeparturesFor, type Suggestion } from "@/lib/commute";
import { crowding, CROWDING_LABEL, loadPct } from "@/lib/domain/boarding";
import { fareForKm, formatKes, splitFare } from "@/lib/domain/fares";
import { nextServiceDate } from "@/lib/domain/schedule";
import { formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { employerSpendThisMonth, listBookingsForEmployee } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Ride" };

/**
 * Tab 2 — Ride.
 *
 * The whole tab is one list: the departures that run between this rider's own
 * two stages, soonest first, each one a single tap away from being booked.
 * Every row carries the three things that decide it — when it leaves, what it
 * costs *this* rider after their employer's share, and how full it is.
 */
export default async function RidePage() {
  const session = await getSession();
  if (!session) redirect("/");

  const { employee, company } = session;
  const now = new Date();
  const today = nairobiDate(now);

  const monthToDate = employerSpendThisMonth(employee.id, today);

  const { serviceDate, suggestions } =
    employee.homeStopId && employee.workStopId
      ? nextDeparturesFor(employee.homeStopId, employee.workStopId, nextServiceDate(today), now)
      : { serviceDate: today, suggestions: [] as Suggestion[] };

  const booked = new Set(
    listBookingsForEmployee(employee.id, { from: today })
      .filter((b) => b.booking.status === "booked" || b.booking.status === "boarded")
      .map((b) => b.booking.tripId),
  );

  return (
    <div className="space-y-5">
      <TabHead
        eyebrow={suggestions.length > 0 ? formatServiceDate(serviceDate) : "Your commute"}
        title="Catch a bus"
        action={
          <Link
            href="/routes"
            className="min-h-11 shrink-0 self-center rounded-xl border-2 border-edge px-3.5 text-sm font-semibold leading-[2.4rem] text-body transition-colors hover:border-brand hover:text-accent"
          >
            All routes
          </Link>
        }
      />

      {suggestions.length === 0 ? (
        <EmptyTab
          icon={<RouteIcon className="size-7" />}
          title="No bus on your commute"
          cta={{ href: "/routes", label: "Browse every route" }}
        >
          Nothing runs between your home and work stages yet. The whole network is one tap away.
        </EmptyTab>
      ) : (
        <div className="tab-enter space-y-6">
          {(["inbound", "outbound"] as const).map((direction) => {
            const leg = suggestions.filter((s) => s.direction === direction).slice(0, 4);
            if (leg.length === 0) return null;

            return (
              <section key={direction}>
                <DirectionChip direction={direction} />
                <ul className="mt-3 space-y-3">
                  {leg.map((s) => (
                    <li key={`${s.trip.trip.id}-${s.boardStopId}`}>
                      <DepartureRow
                        suggestion={s}
                        alreadyBooked={booked.has(s.trip.trip.id)}
                        subsidyBps={company.subsidyBps}
                        monthlyCapKes={company.monthlyCapKes}
                        monthToDateKes={monthToDate}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <Card className="px-5 py-4">
        <Eyebrow>How this works</Eyebrow>
        <p className="mt-1.5 text-base leading-relaxed text-muted">
          No seat to choose — get on and sit down. {company.name} pays{" "}
          {company.subsidyBps / 100}% of every fare, and your share comes off your payslip.
        </p>
      </Card>
    </div>
  );
}

function DepartureRow({
  suggestion,
  alreadyBooked,
  subsidyBps,
  monthlyCapKes,
  monthToDateKes,
}: {
  suggestion: Suggestion;
  alreadyBooked: boolean;
  subsidyBps: number;
  monthlyCapKes: number;
  monthToDateKes: number;
}) {
  const { trip, boardStopId, alightStopId, km } = suggestion;
  const board = trip.timetable.find((s) => s.id === boardStopId)!;
  const alight = trip.timetable.find((s) => s.id === alightStopId)!;

  const quote = splitFare({
    fareKes: fareForKm(km),
    subsidyBps,
    monthlyCapKes,
    monthToDateKes,
  });

  const full = trip.seatsAvailable === 0;
  const pct = loadPct(trip.trip.capacity, trip.seatsBooked);
  const crowdLabel = CROWDING_LABEL[crowding(trip.trip.capacity, trip.seatsBooked)];

  const href = alreadyBooked
    ? "/bookings"
    : `/book/${trip.trip.id}?board=${boardStopId}&alight=${alightStopId}`;

  const body = (
    <>
      <div className="flex items-baseline gap-3">
        <p className="tabular text-3xl font-bold leading-none tracking-tight text-body">
          {board.time}
        </p>
        <p className="tabular flex-1 text-sm text-muted">
          arrive {alight.time} · {trip.route.code}
        </p>
        <p className="tabular text-lg font-bold leading-none text-body">
          {quote.employeeKes === 0 ? "Free" : formatKes(quote.employeeKes)}
        </p>
      </div>

      <p className="mt-2 flex items-center gap-2 text-base font-semibold text-body">
        <span className="min-w-0 flex-1 truncate">{board.name}</span>
        <ArrowIcon className="size-4 shrink-0 text-faint" />
        <span className="min-w-0 flex-1 truncate text-right">{alight.name}</span>
      </p>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <CrowdBar label={crowdLabel} pct={pct} />
        {alreadyBooked ? (
          <span className="flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-on-brand">
            <CheckIcon className="size-4" />
            Booked
          </span>
        ) : full ? (
          <span className="rounded-full bg-flame-soft px-3 py-1.5 text-sm font-semibold text-flame">
            Full
          </span>
        ) : (
          <span className="brand-wash rounded-full px-4 py-1.5 text-sm font-bold text-white">
            Get on
          </span>
        )}
      </div>
    </>
  );

  const skin =
    "block w-full rounded-3xl border-2 bg-surface px-4 py-4 text-left transition-colors";

  if (full && !alreadyBooked) {
    return <div className={`${skin} border-edge opacity-60`}>{body}</div>;
  }

  return (
    <Link href={href} className={`${skin} border-edge hover:border-brand`}>
      {body}
    </Link>
  );
}
