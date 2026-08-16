import Link from "next/link";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/actions";
import { HomeIcon, WorkIcon } from "@/components/icons";
import { Card, Eyebrow, HeroCard, StatTile, TabHead } from "@/components/rider";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSession } from "@/lib/auth";
import { formatKes } from "@/lib/domain/fares";
import { nairobiDate } from "@/lib/domain/time";
import { listBookingsForEmployee, listStops } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Me" };

/**
 * Tab 4 — Me.
 *
 * What this has cost, what the employer has covered, and the two stages on
 * file that every suggestion in the app is built from. The account controls
 * live here rather than in a top bar, so the other three tabs stay entirely
 * about buses.
 */
export default async function MePage() {
  const session = await getSession();
  if (!session) redirect("/");

  const { employee, company } = session;
  const today = nairobiDate();
  const monthStart = `${today.slice(0, 7)}-01`;

  const monthBookings = listBookingsForEmployee(employee.id, { from: monthStart, to: today });
  const monthEmployer = monthBookings.reduce((sum, b) => sum + b.booking.employerKes, 0);
  const monthEmployee = monthBookings.reduce((sum, b) => sum + b.booking.employeeKes, 0);
  const monthTrips = monthBookings.filter((b) => b.booking.status === "boarded").length;

  const stops = new Map(listStops().map((s) => [s.id, s]));
  const home = employee.homeStopId ? stops.get(employee.homeStopId) : undefined;
  const work = employee.workStopId ? stops.get(employee.workStopId) : undefined;

  const capLeft = Math.max(0, company.monthlyCapKes - monthEmployer);
  const capPct =
    company.monthlyCapKes > 0
      ? Math.min(100, Math.round((monthEmployer / company.monthlyCapKes) * 100))
      : 0;

  const monthName = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    month: "long",
  }).format(new Date(`${today}T12:00:00Z`));

  return (
    <div className="space-y-5">
      <TabHead eyebrow={company.name} title={employee.name} action={<ThemeToggle />} />

      <HeroCard>
        <div className="space-y-4 p-6">
          <Eyebrow onWash>{monthName} so far</Eyebrow>
          <div>
            <p className="clock text-white">{formatKes(monthEmployee)}</p>
            <p className="mt-1 text-lg text-white/85">is all you have paid</p>
          </div>
          <p className="border-t border-white/20 pt-4 text-base leading-relaxed text-white/85">
            {company.name} covered{" "}
            <span className="font-bold text-white">{formatKes(monthEmployer)}</span> of your
            fares across {monthTrips} {monthTrips === 1 ? "trip" : "trips"}.
          </p>
        </div>
      </HeroCard>

      <div className="grid grid-cols-3 gap-3">
        <StatTile value={monthTrips} label="Trips taken" />
        <StatTile value={formatKes(monthEmployee)} label="You paid" accent />
        <StatTile value={formatKes(monthEmployer)} label="Employer paid" />
      </div>

      {company.monthlyCapKes > 0 ? (
        <Card className="px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <Eyebrow>Employer allowance</Eyebrow>
            <p className="tabular text-sm font-semibold text-body">
              {formatKes(capLeft)} left
            </p>
          </div>
          <span
            className="mt-2.5 block h-2 overflow-hidden rounded-full bg-edge"
            aria-hidden="true"
          >
            <span
              className={`block h-full rounded-full ${capPct >= 100 ? "bg-flame-vivid" : "brand-wash"}`}
              style={{ width: `${capPct}%` }}
            />
          </span>
          <p className="mt-2 text-sm text-muted">
            {company.name} pays {formatKes(company.monthlyCapKes)} of fares a month. Past that,
            the fare is yours.
          </p>
        </Card>
      ) : (
        <Card className="px-5 py-4">
          <Eyebrow>Your deal</Eyebrow>
          <p className="mt-1.5 text-base text-muted">
            {company.name} covers {company.subsidyBps / 100}% of every fare, with no monthly
            limit.
          </p>
        </Card>
      )}

      <Card className="divide-y divide-line">
        <div className="flex items-center gap-3.5 px-5 py-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-accent">
            <HomeIcon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <Eyebrow>Home stage</Eyebrow>
            <p className="truncate text-lg font-semibold text-body">{home?.name ?? "Not set"}</p>
            {home ? <p className="truncate text-sm text-muted">{home.landmark}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-3.5 px-5 py-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-flame-soft text-flame">
            <WorkIcon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <Eyebrow>Work stage</Eyebrow>
            <p className="truncate text-lg font-semibold text-body">{work?.name ?? "Not set"}</p>
            {work ? <p className="truncate text-sm text-muted">{work.landmark}</p> : null}
          </div>
        </div>
      </Card>

      <p className="px-1 text-sm leading-relaxed text-muted">
        Every departure the app suggests runs between these two stages. Your HR team sets them —
        ask them to change one if you have moved.
      </p>

      {employee.role === "admin" ? (
        <Link
          href="/company"
          className="flex min-h-14 w-full items-center justify-center rounded-2xl border-2 border-edge px-6 text-base font-semibold text-body transition-colors hover:border-brand hover:text-accent"
        >
          Open the {company.name} control panel
        </Link>
      ) : null}

      <form action={signOutAction}>
        <button
          type="submit"
          className="flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-edge px-6 text-base font-semibold text-muted transition-colors hover:border-flame hover:text-flame"
        >
          Sign out
        </button>
      </form>

      <p className="pb-2 text-center text-xs leading-relaxed text-faint">
        Vayliron Shared Transportation · Vayliron Mobility Ltd, Upper Hill, Nairobi
        <br />
        All times East Africa Time (UTC+3)
      </p>
    </div>
  );
}
