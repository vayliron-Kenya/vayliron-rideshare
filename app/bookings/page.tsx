import Link from "next/link";
import { redirect } from "next/navigation";

import { cancelBookingAction } from "@/app/actions";
import { BookingStatusBadge, Card, CardHeader, DirectionBadge, EmptyState } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatKes } from "@/lib/domain/fares";
import { formatServiceDate, nairobiDate, relativeMinutes } from "@/lib/domain/time";
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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-body">My trips</h1>
        <p className="mt-1 text-sm text-muted">
          {upcoming.length} upcoming · {past.length} in history ·{" "}
          {formatKes(covered)} covered by {session.company.name} · {formatKes(spent)} from payroll
        </p>
      </header>

      <Card>
        <CardHeader
          title="Upcoming"
          subtitle="Show the pass code at the door — the conductor types it in"
          action={
            <Link
              href="/dashboard"
              className="whitespace-nowrap text-xs text-muted transition-colors hover:text-brand-bright"
            >
              Book another →
            </Link>
          }
        />
        {upcoming.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No upcoming trips"
              body="Book a seat from your dashboard and it will appear here with a boarding pass."
              action={
                <Link
                  href="/dashboard"
                  className="inline-flex rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-ink"
                >
                  Find a departure
                </Link>
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {upcoming.map((view) => (
              <UpcomingRow
                key={view.booking.id}
                view={view}
                highlighted={view.booking.id === highlight}
              />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="History" subtitle="Your last 30 trips, newest first" />
        {past.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nothing yet" body="Completed trips show up here with what each leg cost." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Line</th>
                  <th className="px-5 py-3 font-medium">Leg</th>
                  <th className="px-5 py-3 text-right font-medium">Fare</th>
                  <th className="px-5 py-3 text-right font-medium">You paid</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {past.map(({ booking, trip, boardStop, alightStop, boardTime }) => (
                  <tr key={booking.id} className="text-muted">
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className="text-body">{formatServiceDate(trip.trip.serviceDate)}</span>
                      <span className="tabular ml-2 text-xs text-faint">{boardTime}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className="tabular text-brand-bright">{trip.route.code}</span>
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {boardStop.name} → {alightStop.name}
                    </td>
                    <td className="tabular whitespace-nowrap px-5 py-3 text-right">
                      {formatKes(booking.fareKes)}
                    </td>
                    <td className="tabular whitespace-nowrap px-5 py-3 text-right text-body">
                      {formatKes(booking.employeeKes)}
                    </td>
                    <td className="px-5 py-3">
                      <BookingStatusBadge status={booking.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function UpcomingRow({ view, highlighted }: { view: BookingView; highlighted: boolean }) {
  const { booking, trip, boardStop, alightStop, boardTime, alightTime } = view;
  const minutesToBoard =
    (trip.departsAt.getTime() - Date.now()) / 60000 + boardStop.adjustedMin;
  const cancellable = booking.status === "booked" && trip.departsAt.getTime() > Date.now();
  const today = nairobiDate();

  return (
    <div
      data-booking-id={booking.id}
      data-trip-id={trip.trip.id}
      data-pass-code={booking.passCode}
      className={`flex flex-wrap items-center gap-x-6 gap-y-4 p-5 ${
        highlighted ? "bg-brand-soft/40" : ""
      }`}
    >
      <div className="w-24 shrink-0">
        <p className="text-xs text-faint">
          {trip.trip.serviceDate === today ? "Today" : formatServiceDate(trip.trip.serviceDate)}
        </p>
        <p className="tabular mt-0.5 text-xl font-semibold text-body">{boardTime}</p>
        <p className="tabular text-xs text-faint">→ {alightTime}</p>
      </div>

      <div className="min-w-[14rem] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tabular text-sm font-medium text-brand-bright">{trip.route.code}</span>
          <span className="text-sm font-medium text-body">{trip.route.name}</span>
          <DirectionBadge direction={trip.trip.direction} />
          <BookingStatusBadge status={booking.status} />
        </div>
        <p className="mt-1.5 text-sm text-muted">
          {boardStop.name} <span className="text-edge">→</span> {alightStop.name}
        </p>
        <p className="mt-0.5 text-xs text-faint">
          {boardStop.landmark} · {trip.vehicle.plate} · {trip.driver.name} ·{" "}
          {formatKes(booking.employeeKes)} from payroll
        </p>
      </div>

      <div className="rounded-xl border border-edge bg-ink px-4 py-2.5 text-center">
        <p className="text-[10px] uppercase tracking-wider text-faint">Pass code</p>
        <p className="mt-0.5 font-mono text-xl font-semibold tracking-[0.25em] text-body">
          {booking.passCode}
        </p>
        <p className="tabular mt-0.5 text-[11px] text-faint">Seat {booking.seatNo}</p>
      </div>

      <div className="flex flex-col items-end gap-2">
        <p className="text-xs text-brand-bright">{relativeMinutes(minutesToBoard)}</p>
        <div className="flex gap-2">
          <Link
            href={`/track/${trip.trip.id}`}
            className="rounded-lg border border-brand/50 px-3 py-1.5 text-xs font-medium text-brand-bright transition-colors hover:bg-brand-soft"
          >
            Track
          </Link>
          {cancellable ? (
            <form action={cancelBookingAction}>
              <input type="hidden" name="bookingId" value={booking.id} />
              <button
                type="submit"
                className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted transition-colors hover:border-flame/60 hover:text-flame"
              >
                Cancel
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
