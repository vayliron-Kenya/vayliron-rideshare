import Link from "next/link";
import { redirect } from "next/navigation";

import { AlertIcon, BusIcon, PinIcon } from "@/components/icons";
import { LiveMap } from "@/components/live-map";
import {
  Card,
  DirectionChip,
  Eyebrow,
  EmptyTab,
  HeroCard,
  PassCode,
  TabHead,
} from "@/components/rider";
import { getSession } from "@/lib/auth";
import { nextDeparturesFor } from "@/lib/commute";
import { nextServiceDate } from "@/lib/domain/schedule";
import { formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { buildPositionPayload } from "@/lib/position";
import { listBookingsForEmployee } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Track" };

/**
 * Tab 1 — Track.
 *
 * One question: where is my bus and how close is it getting? The countdown is
 * the first and largest thing on the screen; once the bus is actually on the
 * road the corridor is drawn underneath it with the bus on it, so "how close"
 * stops being a number and becomes a picture. If there is nothing booked the
 * tab says so and points at the Routes tab rather than showing an empty list.
 */
export default async function TrackPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const { employee } = session;
  const now = new Date();
  const today = nairobiDate(now);

  const upcoming = listBookingsForEmployee(employee.id, { from: today })
    .filter((b) => b.booking.status === "booked" || b.booking.status === "boarded")
    .sort((a, b) => a.trip.departsAt.getTime() - b.trip.departsAt.getTime());

  const next = upcoming.find((b) => b.trip.arrivesAt.getTime() > now.getTime());
  const onTheRoad = next?.trip.trip.status === "in_transit";
  const position = onTheRoad ? buildPositionPayload(next.trip.trip.id) : null;

  return (
    <div className="space-y-5">
      <TabHead eyebrow={formatServiceDate(today)} title={`${greeting(now)}, ${firstName(employee.name)}`} />

      {next ? (
        <>
          <HeroCard>
            <div className="space-y-5 p-6">
              <div className="flex items-center justify-between gap-3">
                <Eyebrow onWash>Your bus</Eyebrow>
                <DirectionChip direction={next.trip.trip.direction} onWash />
              </div>

              <Countdown boardsAt={boardingTime(next)} now={now} boardTime={next.boardTime} />

              <div className="space-y-1.5 border-t border-white/20 pt-4">
                <p className="text-lg text-white">
                  Get on at <span className="font-bold">{next.boardStop.name}</span>
                </p>
                <p className="text-lg text-white/85">
                  Get off at <span className="font-bold text-white">{next.alightStop.name}</span>
                </p>
                <p className="text-sm text-white/70">
                  {next.trip.route.code} · {next.trip.route.name}
                </p>
              </div>

              <PassCode code={next.booking.passCode} onWash />

              <Link
                href={`/track/${next.trip.trip.id}`}
                className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-white text-lg font-bold text-deep transition-transform active:scale-[0.98]"
              >
                <PinIcon className="size-6" />
                {onTheRoad ? "Follow it stage by stage" : "See the whole line"}
              </Link>
            </div>
          </HeroCard>

          {/* Only drawn once the bus is actually moving — a corridor with a
              stationary dot on it at 04:00 answers nothing. */}
          {onTheRoad && position ? <LiveMap initial={position} highlightStopId={next.boardStop.id} /> : null}

          {next.trip.trip.delayMinutes > 0 ? (
            <Card className="flex items-start gap-3 border-amber/40 bg-amber-soft px-4 py-3.5">
              <AlertIcon className="mt-0.5 size-5 shrink-0 text-amber" />
              <div>
                <p className="text-base font-semibold text-amber">
                  Running {next.trip.trip.delayMinutes} minutes late
                </p>
                <p className="mt-0.5 text-sm text-amber">The time above already includes it.</p>
              </div>
            </Card>
          ) : null}

          {upcoming.length > 1 ? (
            <Card className="px-5 py-4">
              <Eyebrow>After that</Eyebrow>
              <ul className="mt-2 space-y-2">
                {upcoming.slice(1, 3).map((b) => (
                  <li key={b.booking.id} className="flex items-baseline gap-3">
                    <span className="tabular w-14 shrink-0 text-lg font-bold text-body">
                      {b.boardTime}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-base text-muted">
                      {b.boardStop.name} → {b.alightStop.name}
                    </span>
                    <span className="shrink-0 text-sm text-faint">
                      {shortDate(b.trip.trip.serviceDate, today)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : (
        <NothingBooked employeeStops={[employee.homeStopId, employee.workStopId]} now={now} />
      )}
    </div>
  );
}

/**
 * The big number, chosen by how soon the bus is.
 *
 * Standing at a stage, "9" and "minutes away" is the only thing worth reading.
 * Tomorrow morning's bus is a different question, and the clock time answers
 * that one, so the same slot carries whichever is actually useful.
 */
function Countdown({
  boardsAt,
  now,
  boardTime,
}: {
  boardsAt: number;
  now: Date;
  boardTime: string;
}) {
  const minutes = Math.round((boardsAt - now.getTime()) / 60000);
  const soon = minutes <= 90;

  if (soon && minutes <= 0) {
    return (
      <div>
        <p className="flex items-center gap-3">
          <span className="live-dot size-3 shrink-0 rounded-full bg-white" aria-hidden="true" />
          <span className="clock text-white">Now</span>
        </p>
        <p className="mt-1 text-xl font-semibold text-white/85">At your stage</p>
      </div>
    );
  }

  if (soon) {
    return (
      <div>
        <p className="flex items-baseline gap-3">
          <span className="clock text-white">{minutes}</span>
          <span className="text-2xl font-semibold text-white/85">
            {minutes === 1 ? "minute" : "minutes"}
          </span>
        </p>
        <p className="tabular mt-1 text-xl font-semibold text-white/85">
          away · boards {boardTime}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="clock text-white">{boardTime}</p>
      <p className="mt-1 text-xl font-semibold text-white/85">{longWait(minutes)}</p>
    </div>
  );
}

async function NothingBooked({
  employeeStops,
  now,
}: {
  employeeStops: [string | null, string | null];
  now: Date;
}) {
  const [home, work] = employeeStops;
  const today = nairobiDate(now);
  const next =
    home && work
      ? nextDeparturesFor(home, work, nextServiceDate(today), now, 1).suggestions[0]
      : undefined;

  return (
    <EmptyTab
      icon={<BusIcon className="size-7" />}
      title="No bus booked"
      cta={{ href: "/routes", label: next ? "Catch the next one" : "See the lines" }}
    >
      {next
        ? `The next one on your commute leaves at ${next.trip.trip.departTime}.`
        : "Pick a departure and your place is held."}
    </EmptyTab>
  );
}

type NextTrip = Awaited<ReturnType<typeof listBookingsForEmployee>>[number];

/** When the bus reaches *this rider's* stage, not when it leaves the terminus. */
function boardingTime(b: NextTrip): number {
  return b.trip.departsAt.getTime() + b.boardStop.adjustedMin * 60000;
}

function longWait(minutes: number): string {
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `In about ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Tomorrow" : `In ${days} days`;
}

function shortDate(serviceDate: string, today: string): string {
  if (serviceDate === today) return "Today";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    weekday: "short",
  }).format(new Date(`${serviceDate}T12:00:00Z`));
}

function firstName(name: string): string {
  return name.split(" ")[0];
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
