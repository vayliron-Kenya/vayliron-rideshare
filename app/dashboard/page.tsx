import Link from "next/link";
import { redirect } from "next/navigation";

import { AlertIcon, BusIcon, PinIcon } from "@/components/icons";
import { DirectionChip, EmptyTab, Eyebrow, HeroCard, PassCode, Screen } from "@/components/rider";
import { getSession } from "@/lib/auth";
import { nextDeparturesFor } from "@/lib/commute";
import { nextServiceDate } from "@/lib/domain/schedule";
import { nairobiDate } from "@/lib/domain/time";
import { buildPositionPayload } from "@/lib/position";
import { listBookingsForEmployee, type BookingView } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "My bus" };

/**
 * Tab 1 — My bus.
 *
 * One question, one screen: how long until my bus gets here. The countdown is
 * the biggest thing on the phone, the two stops sit under it, the code is
 * where a thumb can reach it, and there is one button. Nothing scrolls — if
 * there is more to say, it is on another tab.
 */
export default async function MyBusPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const { employee } = session;
  const now = new Date();
  const today = nairobiDate(now);

  const next = listBookingsForEmployee(employee.id, { from: today })
    .filter((b) => b.booking.status === "booked" || b.booking.status === "boarded")
    .sort((a, b) => a.trip.departsAt.getTime() - b.trip.departsAt.getTime())
    .find((b) => b.trip.arrivesAt.getTime() > now.getTime());

  if (!next) {
    return (
      <Screen eyebrow={greeting(now)} title={firstName(employee.name)}>
        <NothingBooked home={employee.homeStopId} work={employee.workStopId} now={now} />
      </Screen>
    );
  }

  const progress = buildPositionPayload(next.trip.trip.id, now)?.progress ?? 0;

  return (
    <Screen
      eyebrow={greeting(now)}
      title={firstName(employee.name)}
      action={<DirectionChip direction={next.trip.trip.direction} />}
    >
      <HeroCard grow>
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <Eyebrow onWash>
              {next.trip.route.code} · {next.trip.route.name}
            </Eyebrow>
            {next.trip.trip.status === "in_transit" ? (
              <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold text-white">
                <span className="live-dot size-1.5 rounded-full bg-white" aria-hidden="true" />
                ON THE WAY
              </span>
            ) : null}
          </div>

          <Countdown view={next} now={now} />

          {/* The rest of the panel is the line itself, with the bus on it —
              which is the real answer to "how close is it getting to me". */}
          <Rail view={next} progress={progress} />

          {next.trip.trip.delayMinutes > 0 ? (
            <p className="flex shrink-0 items-center gap-2 rounded-2xl bg-white/15 px-3.5 py-2.5 text-sm font-semibold text-white">
              <AlertIcon className="size-4 shrink-0" />
              Running {next.trip.trip.delayMinutes} minutes late — the times above count it
            </p>
          ) : null}
        </div>
      </HeroCard>

      <PassCode code={next.booking.passCode} />

      <Link
        href={`/track/${next.trip.trip.id}`}
        className="brand-wash glow flex min-h-16 shrink-0 items-center justify-center gap-3 rounded-[1.4rem] text-lg font-bold text-white transition-transform active:scale-[0.98]"
      >
        <PinIcon className="size-6" />
        Where is it now?
      </Link>
    </Screen>
  );
}

/**
 * The big number, chosen by how soon the bus is.
 *
 * Standing at a stop, "9" and "minutes away" is the only thing worth reading.
 * Tomorrow morning's bus is a different question and the clock answers that
 * one, so the same slot carries whichever is actually useful.
 */
function Countdown({ view, now }: { view: BookingView; now: Date }) {
  const minutes = Math.round(
    (view.trip.departsAt.getTime() + view.boardStop.adjustedMin * 60000 - now.getTime()) / 60000,
  );

  if (minutes <= 0) {
    return (
      <div>
        <p className="flex items-center gap-3">
          <span className="live-dot size-4 shrink-0 rounded-full bg-white" aria-hidden="true" />
          <span className="clock text-white">Here</span>
        </p>
        <p className="mt-1 text-xl font-semibold text-white/80">Get on now</p>
      </div>
    );
  }

  if (minutes <= 90) {
    return (
      <div>
        <p className="flex items-baseline gap-3">
          <span className="clock text-white">{minutes}</span>
          <span className="text-2xl font-semibold text-white/80">
            {minutes === 1 ? "minute" : "minutes"}
          </span>
        </p>
        <p className="mt-1 text-xl font-semibold text-white/80">until it reaches you</p>
      </div>
    );
  }

  return (
    <div>
      <p className="clock text-white">{view.boardTime}</p>
      <p className="mt-1 text-xl font-semibold text-white/80">{longWait(minutes)}</p>
    </div>
  );
}

/**
 * The line, drawn down the panel, with the bus on it.
 *
 * A countdown says how long; this says how close, which is the thing people
 * actually crane their necks for. Your two stops are the bright ones — the
 * rest are the stops between the bus and you, and the marker slides down the
 * rail as the bus works through them.
 */
function Rail({ view, progress }: { view: BookingView; progress: number }) {
  const stops = view.trip.timetable;
  const boardIndex = stops.findIndex((s) => s.id === view.boardStop.id);
  const alightIndex = stops.findIndex((s) => s.id === view.alightStop.id);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col justify-between py-1">
      {/* The rail, and the part of it the bus has already covered. */}
      <span
        aria-hidden="true"
        className="absolute bottom-3 left-[5px] top-3 w-0.5 rounded-full bg-white/25"
      />
      <span
        aria-hidden="true"
        className="absolute left-[5px] top-3 w-0.5 rounded-full bg-white"
        style={{ height: `calc(${Math.min(100, Math.max(0, progress * 100))}% - 1.5rem)` }}
      />

      {stops.map((stop, index) => {
        const mine = index === boardIndex || index === alightIndex;
        const onMyLeg = index >= boardIndex && index <= alightIndex;

        return (
          <div key={stop.id} className="relative flex items-center gap-3">
            <span className="flex w-3 shrink-0 justify-center">
            <span
              className={`z-10 shrink-0 rounded-full ${
                mine ? "size-3 bg-white" : onMyLeg ? "size-2.5 bg-white/70" : "size-2 bg-white/35"
              }`}
              aria-hidden="true"
              />
            </span>
            <span
              className={`min-w-0 flex-1 truncate ${
                mine
                  ? "text-base font-bold text-white"
                  : onMyLeg
                    ? "text-sm text-white/75"
                    : "text-sm text-white/45"
              }`}
            >
              {stop.name}
              {index === boardIndex ? " · get on" : index === alightIndex ? " · get off" : ""}
            </span>
            <span
              className={`tabular shrink-0 text-sm ${
                mine ? "font-bold text-white" : "text-white/50"
              }`}
            >
              {stop.time}
            </span>
          </div>
        );
      })}
    </div>
  );
}

async function NothingBooked({
  home,
  work,
  now,
}: {
  home: string | null;
  work: string | null;
  now: Date;
}) {
  const today = nairobiDate(now);
  const soonest =
    home && work
      ? nextDeparturesFor(home, work, nextServiceDate(today), now, 1).suggestions[0]
      : undefined;

  return (
    <EmptyTab
      icon={<BusIcon className="size-8" />}
      title="No bus yet"
      cta={{ href: "/routes", label: soonest ? "Catch the next one" : "See what's running" }}
    >
      {soonest
        ? `The next one going your way leaves at ${soonest.trip.trip.departTime}.`
        : "Pick a bus and it will show up here."}
    </EmptyTab>
  );
}

function longWait(minutes: number): string {
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in about ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return days === 1 ? "tomorrow" : `in ${days} days`;
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
