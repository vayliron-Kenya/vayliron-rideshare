import Link from "next/link";
import { redirect } from "next/navigation";

import { DepartureRow } from "@/components/departure-row";
import { Card, CardHeader, DirectionBadge, EmptyState, Stat } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { fareForKm, formatKes } from "@/lib/domain/fares";
import { nextServiceDate } from "@/lib/domain/schedule";
import { addDays, formatServiceDate, nairobiDate, relativeMinutes } from "@/lib/domain/time";
import {
  commuteMatches,
  listBookingsForEmployee,
  listTrips,
  type TripSummary,
} from "@/lib/queries";
import type { Direction } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Today" };

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const { employee, company } = session;
  const now = new Date();
  const today = nairobiDate(now);
  const serviceDate = nextServiceDate(today);

  const upcoming = listBookingsForEmployee(employee.id, { from: today })
    .filter((b) => b.booking.status === "booked" || b.booking.status === "boarded")
    .sort((a, b) => a.trip.departsAt.getTime() - b.trip.departsAt.getTime());

  const nextTrip = upcoming.find((b) => b.trip.arrivesAt.getTime() > now.getTime());

  // Month-to-date position for this rider.
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthBookings = listBookingsForEmployee(employee.id, { from: monthStart, to: today });
  const monthEmployer = monthBookings.reduce((sum, b) => sum + b.booking.employerKes, 0);
  const monthEmployee = monthBookings.reduce((sum, b) => sum + b.booking.employeeKes, 0);
  const monthTrips = monthBookings.filter((b) => b.booking.status === "boarded").length;

  const capHint =
    company.monthlyCapKes > 0
      ? `${formatKes(Math.max(0, company.monthlyCapKes - monthEmployer))} of your employer allowance left`
      : `${company.name} covers ${company.subsidyBps / 100}% of every fare`;

  // Suggested departures on the commute this person actually makes.
  const suggested =
    employee.homeStopId && employee.workStopId
      ? nextDeparturesFor(employee.homeStopId, employee.workStopId, serviceDate, now)
      : { serviceDate, suggestions: [] };
  const suggestions = suggested.suggestions;

  const bookedTripIds = new Set(upcoming.map((b) => b.booking.tripId));

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-faint">
          {formatServiceDate(today)} · {company.name}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-body">
          {greeting(now)}, {employee.name.split(" ")[0]}.
        </h1>
      </header>

      {nextTrip ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-5 p-5">
            <div>
              <p className="text-xs uppercase tracking-wider text-faint">Your next trip</p>
              <p className="tabular mt-1 text-3xl font-semibold text-body">
                {nextTrip.boardTime}
              </p>
              <p className="mt-1 text-sm text-brand-bright">
                {relativeMinutes(
                  (nextTrip.trip.departsAt.getTime() - now.getTime()) / 60000 +
                    (nextTrip.boardStop.adjustedMin ?? 0),
                )}
              </p>
            </div>

            <div className="min-w-[14rem] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular text-sm font-medium text-brand-bright">
                  {nextTrip.trip.route.code}
                </span>
                <span className="text-sm font-medium text-body">{nextTrip.trip.route.name}</span>
                <DirectionBadge direction={nextTrip.trip.trip.direction} />
              </div>
              <p className="mt-1.5 text-sm text-muted">
                Board at <span className="text-body">{nextTrip.boardStop.name}</span> ·{" "}
                {nextTrip.boardStop.landmark}
              </p>
              <p className="mt-0.5 text-xs text-faint">
                Arrives {nextTrip.alightStop.name} at {nextTrip.alightTime} ·{" "}
                {nextTrip.trip.vehicle.plate} · {nextTrip.trip.driver.name}
              </p>
            </div>

            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-faint">Boarding pass</p>
              <p className="tabular mt-1 font-mono text-2xl font-semibold tracking-[0.2em] text-body">
                {nextTrip.booking.passCode}
              </p>
              <p className="tabular mt-1 text-xs text-faint">Seat {nextTrip.booking.seatNo}</p>
            </div>

            <div className="flex gap-2">
              <Link
                href={`/track/${nextTrip.trip.trip.id}`}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-brand-bright"
              >
                Track bus
              </Link>
              <Link
                href="/bookings"
                className="rounded-xl border border-edge px-4 py-2 text-sm text-muted transition-colors hover:text-body"
              >
                All trips
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="No seat booked yet"
          body={`Pick a departure below and you'll get a numbered seat and a boarding pass for ${formatServiceDate(serviceDate)}.`}
        />
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Trips this month" value={monthTrips} hint="Boarded and settled" />
        <Stat
          label="Employer paid"
          value={formatKes(monthEmployer)}
          tone="brand"
          hint={capHint}
        />
        <Stat
          label="You paid"
          value={formatKes(monthEmployee)}
          hint={monthEmployee === 0 ? "Fully covered by your employer" : "Deducted from payroll"}
        />
        <Stat
          label="Seats held"
          value={upcoming.filter((b) => b.booking.status === "booked").length}
          hint="Upcoming departures"
        />
      </section>

      <section>
        <Card>
          <CardHeader
            title={`Your commute · ${formatServiceDate(suggested.serviceDate)}`}
            subtitle={
              employee.homeStopId && employee.workStopId
                ? "Departures that serve both your home stage and your workplace"
                : "Set a home and work stage to get personalised departures"
            }
            action={
              <Link
                href="/routes"
                className="whitespace-nowrap text-xs text-muted transition-colors hover:text-brand-bright"
              >
                All routes →
              </Link>
            }
          />

          {suggestions.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nothing scheduled on that commute"
                body="No line currently runs between your home and work stages on that day. Browse the full network to find a nearby stage."
              />
            </div>
          ) : (
            <div>
              {suggestions.map(({ trip, boardStopId, alightStopId, km }) => (
                <DepartureRow
                  key={trip.trip.id}
                  trip={trip}
                  boardStopId={boardStopId}
                  alightStopId={alightStopId}
                  fareKes={fareForKm(km)}
                  alreadyBooked={bookedTripIds.has(trip.trip.id)}
                />
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

interface Suggestion {
  trip: TripSummary;
  boardStopId: string;
  alightStopId: string;
  km: number;
  direction: Direction;
}

/**
 * Rolls forward until there is actually something to catch.
 *
 * By late afternoon every remaining departure on the day has gone, and showing
 * a commuter an empty list when Monday's bus is sitting right there is simply
 * wrong. Looks up to a week ahead, which covers a Sunday and a public holiday
 * back to back.
 */
function nextDeparturesFor(
  homeStopId: string,
  workStopId: string,
  from: string,
  now: Date,
): { serviceDate: string; suggestions: Suggestion[] } {
  let serviceDate = from;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const suggestions = buildSuggestions(homeStopId, workStopId, serviceDate, now);
    if (suggestions.length > 0) return { serviceDate, suggestions };
    serviceDate = nextServiceDate(addDays(serviceDate, 1));
  }

  return { serviceDate: from, suggestions: [] };
}

/**
 * Morning departures towards work and evening departures back home, on the
 * lines that serve both of this person's stages.
 */
function buildSuggestions(
  homeStopId: string,
  workStopId: string,
  serviceDate: string,
  now: Date,
): Suggestion[] {
  const legs = [
    { from: homeStopId, to: workStopId },
    { from: workStopId, to: homeStopId },
  ];

  const suggestions: Suggestion[] = [];

  for (const leg of legs) {
    for (const match of commuteMatches(leg.from, leg.to)) {
      const trips = listTrips({
        serviceDate,
        routeId: match.route.id,
        direction: match.direction,
      });

      for (const trip of trips) {
        // Hide departures whose boarding stage has already been passed today.
        const board = trip.timetable.find((s) => s.id === leg.from);
        if (!board) continue;
        const boardsAt = trip.departsAt.getTime() + board.adjustedMin * 60000;
        if (boardsAt < now.getTime()) continue;

        suggestions.push({
          trip,
          boardStopId: leg.from,
          alightStopId: leg.to,
          km: match.km,
          direction: match.direction,
        });
      }
    }
  }

  return suggestions
    .sort((a, b) => a.trip.departsAt.getTime() - b.trip.departsAt.getTime())
    .slice(0, 8);
}

function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Nairobi",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
