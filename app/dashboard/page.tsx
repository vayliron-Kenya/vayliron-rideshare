import { redirect } from "next/navigation";

import {
  AlertIcon,
  ArrowIcon,
  BusIcon,
  CheckIcon,
  HomeIcon,
  PinIcon,
  WorkIcon,
} from "@/components/icons";
import { BigButton, BigFact, ChoiceRow, Notice } from "@/components/simple";
import { getSession } from "@/lib/auth";
import { fareForKm, formatKes } from "@/lib/domain/fares";
import { nextServiceDate } from "@/lib/domain/schedule";
import { addDays, formatServiceDate, nairobiDate } from "@/lib/domain/time";
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
    <div className="space-y-7 pb-8">
      <header>
        <p className="text-base text-muted">{formatServiceDate(today)}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-body">
          {greeting(now)}, {employee.name.split(" ")[0]}
        </h1>
      </header>

      {nextTrip ? (
        <section className="overflow-hidden rounded-3xl border-2 border-brand/40 bg-brand-soft">
          <div className="flex items-center gap-3 border-b-2 border-brand/20 px-5 py-3">
            <BusIcon className="size-6 text-accent" />
            <h2 className="text-lg font-bold text-accent">Your bus</h2>
          </div>

          <div className="space-y-5 p-5">
            <div>
              <p className="tabular text-6xl font-bold leading-none text-body">
                {nextTrip.boardTime}
              </p>
              <p className="mt-2 text-xl font-semibold text-accent">
                {leavesIn(nextTrip.trip.departsAt, nextTrip.boardStop.adjustedMin, now)}
              </p>
            </div>

            <div className="space-y-2.5">
              <p className="flex items-center gap-2.5 text-lg text-body">
                <PinIcon className="size-5 shrink-0 text-muted" />
                <span>
                  Get on at <span className="font-bold">{nextTrip.boardStop.name}</span>
                </span>
              </p>
              <p className="flex items-center gap-2.5 text-lg text-body">
                <ArrowIcon className="size-5 shrink-0 text-muted" />
                <span>
                  Get off at <span className="font-bold">{nextTrip.alightStop.name}</span>
                </span>
              </p>
            </div>

            {nextTrip.trip.trip.delayMinutes > 0 ? (
              <Notice
                tone="warn"
                icon={<AlertIcon className="size-5" />}
                title={`The bus is ${nextTrip.trip.trip.delayMinutes} minutes late`}
              >
                The time above already includes the delay.
              </Notice>
            ) : null}

            <div className="rounded-2xl border-2 border-brand/30 bg-surface p-4 text-center">
              <p className="text-sm font-medium text-muted">Show this to the conductor</p>
              <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em] text-body">
                {nextTrip.booking.passCode}
              </p>
            </div>

            <BigButton
              href={`/track/${nextTrip.trip.trip.id}`}
              icon={<PinIcon className="size-6" />}
            >
              Where is my bus?
            </BigButton>
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border-2 border-dashed border-edge p-6 text-center">
          <BusIcon className="mx-auto size-10 text-faint" />
          <h2 className="mt-3 text-xl font-bold text-body">You have no bus booked</h2>
          <p className="mx-auto mt-1 max-w-sm text-base text-muted">
            Pick a time below and we will save you a seat.
          </p>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-bold tracking-tight text-body">Book a seat</h2>
        <p className="mt-1 text-base text-muted">
          {suggestions.length > 0
            ? `Buses on ${formatServiceDate(suggested.serviceDate)}`
            : "No bus goes between your two stages"}
        </p>

        {suggestions.length === 0 ? (
          <div className="mt-4">
            <BigButton href="/routes" tone="quiet">
              See all the routes
            </BigButton>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {suggestions.map(({ trip, boardStopId, alightStopId, km }) => {
              const board = trip.timetable.find((s) => s.id === boardStopId)!;
              const alight = trip.timetable.find((s) => s.id === alightStopId)!;
              const booked = bookedTripIds.has(trip.trip.id);
              const goingToWork = trip.trip.direction === "inbound";

              return (
                <li key={trip.trip.id}>
                  <ChoiceRow
                    href={
                      booked
                        ? "/bookings"
                        : `/book/${trip.trip.id}?board=${boardStopId}&alight=${alightStopId}`
                    }
                    selected={booked}
                    icon={
                      goingToWork ? (
                        <WorkIcon className="size-6" />
                      ) : (
                        <HomeIcon className="size-6" />
                      )
                    }
                    title={
                      <span className="tabular">
                        {board.time} · {goingToWork ? "To work" : "To home"}
                      </span>
                    }
                    detail={
                      <>
                        {board.name} → {alight.name} · {trip.seatsAvailable} seats left
                      </>
                    }
                    trailing={
                      booked ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-brand px-3 py-2 text-sm font-semibold text-on-brand">
                          <CheckIcon className="size-4" />
                          Booked
                        </span>
                      ) : (
                        <span className="tabular shrink-0 text-right">
                          <span className="block text-lg font-bold text-body">
                            {formatKes(fareForKm(km))}
                          </span>
                          <span className="block text-xs text-muted">total fare</span>
                        </span>
                      )
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-bold tracking-tight text-body">This month</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <BigFact value={monthTrips} label="Trips taken" />
          <BigFact value={formatKes(monthEmployee)} label="You paid" tone="brand" />
          <BigFact value={formatKes(monthEmployer)} label={`${company.name} paid`} />
        </div>
        <p className="mt-3 text-sm text-muted">{capHint}</p>
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

/** "Leaves in 8 minutes" reads better on a stage than "in 8 min". */
function leavesIn(departsAt: Date, minutesToBoardStop: number, now: Date): string {
  const minutes = Math.round(
    (departsAt.getTime() - now.getTime()) / 60000 + minutesToBoardStop,
  );

  if (minutes <= 0) return "Arriving now";
  if (minutes === 1) return "Leaves in 1 minute";
  if (minutes < 60) return `Leaves in ${minutes} minutes`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourWord = hours === 1 ? "1 hour" : `${hours} hours`;
  if (rest === 0) return `Leaves in ${hourWord}`;
  return `Leaves in ${hourWord} ${rest} min`;
}
