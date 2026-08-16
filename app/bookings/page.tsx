import Link from "next/link";
import { redirect } from "next/navigation";

import { cancelBookingAction } from "@/app/actions";
import { AlertIcon, PinIcon, TicketIcon } from "@/components/icons";
import {
  Card,
  DirectionChip,
  EmptyTab,
  Eyebrow,
  HeroCard,
  PassCode,
  TabHead,
} from "@/components/rider";
import { BookingStatusBadge } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatKes } from "@/lib/domain/fares";
import { formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { listBookingsForEmployee, type BookingView } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Trips" };

interface PageProps {
  searchParams: Promise<{ highlight?: string }>;
}

/**
 * Tab 3 — Trips.
 *
 * The next booked bus is the ticket, rendered as the loud card with the pass
 * code big enough to read at the door. Everything else on the tab is history,
 * which is quiet and can be scrolled without cost.
 */
export default async function TripsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/");

  const { highlight } = await searchParams;
  const now = Date.now();
  const today = nairobiDate();

  const all = listBookingsForEmployee(session.employee.id, { includeCancelled: true });
  const upcoming = all
    .filter((b) => b.trip.arrivesAt.getTime() > now && b.booking.status !== "cancelled")
    .sort((a, b) => a.trip.departsAt.getTime() - b.trip.departsAt.getTime());
  const past = all
    .filter((b) => b.trip.arrivesAt.getTime() <= now || b.booking.status === "cancelled")
    .slice(0, 30);

  const covered = past.reduce((sum, b) => sum + b.booking.employerKes, 0);

  // The highlighted booking is the one the rider has just made, so it leads
  // even if an earlier departure is technically next.
  const lead =
    upcoming.find((b) => b.booking.id === highlight) ?? upcoming[0] ?? null;
  const rest = upcoming.filter((b) => b.booking.id !== lead?.booking.id);

  return (
    <div className="space-y-5">
      <TabHead
        eyebrow={upcoming.length === 1 ? "1 bus booked" : `${upcoming.length} buses booked`}
        title="Your tickets"
      />

      {lead ? (
        <Ticket view={lead} today={today} />
      ) : (
        <EmptyTab
          icon={<TicketIcon className="size-7" />}
          title="No tickets yet"
          cta={{ href: "/ride", label: "Catch a bus" }}
        >
          Book a departure and your boarding code shows up here.
        </EmptyTab>
      )}

      {rest.length > 0 ? (
        <Card className="px-5 py-4">
          <Eyebrow>Also booked</Eyebrow>
          <ul className="mt-2 divide-y divide-line">
            {rest.map((b) => (
              <li key={b.booking.id} data-booking-id={b.booking.id}>
                <Link
                  href={`/bookings?highlight=${b.booking.id}`}
                  className="flex items-baseline gap-3 py-2.5"
                >
                  <span className="tabular w-14 shrink-0 text-lg font-bold text-body">
                    {b.boardTime}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-base text-muted">
                    {b.boardStop.name} → {b.alightStop.name}
                  </span>
                  <span className="shrink-0 text-sm text-faint">
                    {formatServiceDate(b.trip.trip.serviceDate)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {past.length > 0 ? (
        <Card className="px-5 py-4">
          <Eyebrow>Trips you have taken</Eyebrow>
          <ul className="mt-2 divide-y divide-line">
            {past.slice(0, 12).map(({ booking, trip, boardStop, alightStop, boardTime }) => (
              <li key={booking.id} className="flex items-center gap-3 py-2.5">
                <span className="tabular w-14 shrink-0 text-base font-semibold text-body">
                  {boardTime}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base text-muted">
                    {boardStop.name} → {alightStop.name}
                  </span>
                  <span className="block text-xs text-faint">
                    {formatServiceDate(trip.trip.serviceDate)}
                  </span>
                </span>
                <span className="tabular shrink-0 text-base font-semibold text-body">
                  {formatKes(booking.employeeKes)}
                </span>
                <BookingStatusBadge status={booking.status} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">
            {formatKes(covered)} of these were paid by {session.company.name}.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

/** The next bus, as a ticket to hold up at the door. */
function Ticket({ view, today }: { view: BookingView; today: string }) {
  const { booking, trip, boardStop, alightStop, boardTime, alightTime } = view;
  const cancellable = booking.status === "booked" && trip.departsAt.getTime() > Date.now();
  const isToday = trip.trip.serviceDate === today;

  return (
    <div
      data-booking-id={booking.id}
      data-trip-id={trip.trip.id}
      data-pass-code={booking.passCode}
      className="space-y-3"
    >
      <HeroCard>
        <div className="space-y-5 p-6">
          <div className="flex items-center justify-between gap-3">
            <Eyebrow onWash>{isToday ? "Today" : formatServiceDate(trip.trip.serviceDate)}</Eyebrow>
            <DirectionChip direction={trip.trip.direction} onWash />
          </div>

          <div>
            <p className="clock text-white">{boardTime}</p>
            <p className="mt-2 text-lg text-white">
              Get on at <span className="font-bold">{boardStop.name}</span>
            </p>
            <p className="text-lg text-white/85">
              Get off at <span className="font-bold text-white">{alightStop.name}</span>, about{" "}
              {alightTime}
            </p>
          </div>

          {trip.trip.delayMinutes > 0 ? (
            <p className="flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2.5 text-base font-semibold text-white">
              <AlertIcon className="size-5 shrink-0" />
              Running {trip.trip.delayMinutes} minutes late
            </p>
          ) : null}

          <PassCode code={booking.passCode} onWash />

          <Link
            href={`/track/${trip.trip.id}`}
            className="flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-white text-lg font-bold text-deep transition-transform active:scale-[0.98]"
          >
            <PinIcon className="size-6" />
            Where is my bus?
          </Link>
        </div>
      </HeroCard>

      {cancellable ? (
        <form action={cancelBookingAction}>
          <input type="hidden" name="bookingId" value={booking.id} />
          <button
            type="submit"
            className="flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-edge px-6 text-base font-semibold text-muted transition-colors hover:border-flame hover:text-flame"
          >
            Cancel this trip
          </button>
        </form>
      ) : null}
    </div>
  );
}
