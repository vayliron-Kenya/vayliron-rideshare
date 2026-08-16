import { redirect } from "next/navigation";

import { cancelBookingAction } from "@/app/actions";
import { AlertIcon, BusIcon, PinIcon, TicketIcon } from "@/components/icons";
import { BigButton } from "@/components/simple";
import { BookingStatusBadge } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatKes } from "@/lib/domain/fares";
import { formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { listBookingsForEmployee, type BookingView } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "My trips" };

interface PageProps {
  searchParams: Promise<{ highlight?: string }>;
}

export default async function BookingsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/");

  const { highlight } = await searchParams;
  const now = Date.now();

  const all = listBookingsForEmployee(session.employee.id, { includeCancelled: true });
  const upcoming = all
    .filter((b) => b.trip.arrivesAt.getTime() > now && b.booking.status !== "cancelled")
    .sort((a, b) => a.trip.departsAt.getTime() - b.trip.departsAt.getTime());
  const past = all
    .filter((b) => b.trip.arrivesAt.getTime() <= now || b.booking.status === "cancelled")
    .slice(0, 30);

  const spent = past.reduce((sum, b) => sum + b.booking.employeeKes, 0);
  const covered = past.reduce((sum, b) => sum + b.booking.employerKes, 0);

  return (
    <div className="space-y-7 pb-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-body">My trips</h1>
        <p className="mt-1 text-base text-muted">
          {upcoming.length === 0
            ? "You have no bus booked."
            : upcoming.length === 1
              ? "You have 1 bus booked."
              : `You have ${upcoming.length} buses booked.`}
        </p>
      </header>

      {upcoming.length === 0 ? (
        <section className="rounded-3xl border-2 border-dashed border-edge p-6 text-center">
          <TicketIcon className="mx-auto size-10 text-faint" />
          <h2 className="mt-3 text-xl font-bold text-body">Nothing booked yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-base text-muted">
            Book a seat and your ticket will show up here.
          </p>
          <div className="mx-auto mt-5 max-w-xs">
            <BigButton href="/dashboard" icon={<BusIcon className="size-6" />}>
              Find a bus
            </BigButton>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          {upcoming.map((view) => (
            <TicketCard
              key={view.booking.id}
              view={view}
              highlighted={view.booking.id === highlight}
              today={nairobiDate()}
            />
          ))}
        </section>
      )}

      {past.length > 0 ? (
        <section>
          <h2 className="text-2xl font-bold tracking-tight text-body">Trips you have taken</h2>
          <ul className="mt-4 space-y-2">
            {past.slice(0, 12).map(({ booking, trip, boardStop, alightStop, boardTime }) => (
              <li
                key={booking.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border-2 border-edge bg-surface px-4 py-3"
              >
                <span className="tabular w-20 shrink-0 text-base font-semibold text-body">
                  {boardTime}
                </span>
                <span className="min-w-[10rem] flex-1 text-base text-muted">
                  {boardStop.name} → {alightStop.name}
                </span>
                <span className="text-sm text-muted">
                  {formatServiceDate(trip.trip.serviceDate)}
                </span>
                <span className="tabular text-base font-semibold text-body">
                  {formatKes(booking.employeeKes)}
                </span>
                <BookingStatusBadge status={booking.status} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">
            {formatKes(covered)} of these were paid by {session.company.name}.
          </p>
        </section>
      ) : null}
    </div>
  );
}

/** One booked bus, as a ticket a rider can hold up at the door. */
function TicketCard({
  view,
  highlighted,
  today,
}: {
  view: BookingView;
  highlighted: boolean;
  today: string;
}) {
  const { booking, trip, boardStop, alightStop, boardTime, alightTime } = view;
  const cancellable = booking.status === "booked" && trip.departsAt.getTime() > Date.now();
  const isToday = trip.trip.serviceDate === today;

  return (
    <article
      data-booking-id={booking.id}
      data-trip-id={trip.trip.id}
      data-pass-code={booking.passCode}
      className={`overflow-hidden rounded-3xl border-2 ${
        highlighted ? "border-brand" : "border-edge"
      } bg-surface`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-soft px-5 py-3">
        <p className="flex items-center gap-2 text-base font-bold text-accent">
          <BusIcon className="size-5" />
          {isToday ? "Today" : formatServiceDate(trip.trip.serviceDate)}
        </p>
        {trip.trip.delayMinutes > 0 ? (
          <span className="flex items-center gap-1.5 text-base font-semibold text-flame">
            <AlertIcon className="size-5" />
            {trip.trip.delayMinutes} min late
          </span>
        ) : (
          <span className="text-base text-muted">On time</span>
        )}
      </div>

      <div className="space-y-5 p-5">
        <div>
          <p className="tabular text-5xl font-bold leading-none text-body">{boardTime}</p>
          <p className="mt-2 text-lg text-body">
            Get on at <span className="font-bold">{boardStop.name}</span>
          </p>
          <p className="mt-0.5 text-base text-muted">
            Get off at {alightStop.name}, about {alightTime}
          </p>
        </div>

        <div className="rounded-2xl border-2 border-edge bg-raised p-4 text-center">
          <p className="text-sm font-medium text-muted">Show this to the conductor</p>
          <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em] text-body">
            {booking.passCode}
          </p>
          <p className="tabular mt-1 text-base text-muted">Seat {booking.seatNo}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <BigButton href={`/track/${trip.trip.id}`} icon={<PinIcon className="size-6" />}>
            Where is my bus?
          </BigButton>
          {cancellable ? (
            <form action={cancelBookingAction}>
              <input type="hidden" name="bookingId" value={booking.id} />
              <button
                type="submit"
                className="flex min-h-14 w-full items-center justify-center rounded-2xl border-2 border-edge px-6 text-lg font-semibold text-muted transition-colors hover:border-flame hover:text-flame"
              >
                Cancel this seat
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </article>
  );
}
