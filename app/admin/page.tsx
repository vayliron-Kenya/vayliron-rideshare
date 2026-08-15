import Link from "next/link";
import { redirect } from "next/navigation";

import { SpendChart } from "@/components/spend-chart";
import { Card, CardHeader, EmptyState, Meter, Stat } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatKes } from "@/lib/domain/fares";
import { addDays, formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { companyMetrics, dailySpend, riderSpend, routeUsage } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Company" };

const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
] as const;

interface PageProps {
  searchParams: Promise<{ range?: string }>;
}

export default async function AdminPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.employee.role !== "admin") {
    return (
      <EmptyState
        title="Admins only"
        body="This view is limited to the HR and finance admins on your company account. Ask your Vayliron account owner if you need access."
      />
    );
  }

  const { range } = await searchParams;
  const days = RANGES.some((r) => r.key === range) ? Number(range) : 30;

  const today = nairobiDate();
  const from = addDays(today, -(days - 1));
  const company = session.company;

  const metrics = companyMetrics(company.id, from, today);
  if (!metrics) redirect("/dashboard");

  const usage = routeUsage(company.id, from, today).filter((u) => u.bookings > 0);
  const riders = riderSpend(company.id, from, today);
  const spend = dailySpend(company.id, from, today);

  const activeRiders = riders.filter((r) => r.trips > 0);
  const adoption = metrics.headcount === 0
    ? 0
    : Math.round((metrics.activeRiders / metrics.headcount) * 100);
  const avgFarePerTrip = metrics.tripsTaken === 0
    ? 0
    : Math.round((metrics.employerKes + metrics.employeeKes) / metrics.tripsTaken);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-faint">{company.name}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-body">
            Commuter programme
          </h1>
          <p className="mt-1 text-sm text-muted">
            {formatServiceDate(from)} – {formatServiceDate(today)} · billed to{" "}
            {company.billingEmail} · KRA PIN {company.kraPin}
          </p>
        </div>

        <div className="flex rounded-xl border border-edge p-1">
          {RANGES.map((option) => (
            <Link
              key={option.key}
              href={`/admin?range=${option.key}`}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                String(days) === option.key
                  ? "bg-raised font-medium text-body"
                  : "text-muted hover:text-body"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Employer spend"
          value={formatKes(metrics.employerKes)}
          tone="brand"
          hint={`${formatKes(avgFarePerTrip)} average fare per trip`}
        />
        <Stat
          label="Trips taken"
          value={metrics.tripsTaken.toLocaleString("en-KE")}
          hint={`${metrics.bookings.toLocaleString("en-KE")} seats reserved`}
        />
        <Stat
          label="Staff riding"
          value={`${metrics.activeRiders} / ${metrics.headcount}`}
          hint={`${adoption}% of headcount used the service`}
        />
        <Stat
          label="Attendance"
          value={`${metrics.attendancePct}%`}
          tone={metrics.attendancePct >= 90 ? "brand" : "amber"}
          hint={`${metrics.noShows} no-shows, ${metrics.cancellations} cancellations`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Daily employer spend"
            subtitle={`Employees contributed a further ${formatKes(metrics.employeeKes)} through payroll`}
          />
          <SpendChart points={spend} />
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-body">Subsidy policy</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Employer share</dt>
                <dd className="tabular font-medium text-body">{company.subsidyBps / 100}%</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Monthly cap per employee</dt>
                <dd className="tabular font-medium text-body">
                  {company.monthlyCapKes > 0 ? formatKes(company.monthlyCapKes) : "Uncapped"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Staff contribution</dt>
                <dd className="tabular font-medium text-body">
                  {formatKes(metrics.employeeKes)}
                </dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-faint">
              Road passenger transport is an exempt supply under Kenya&apos;s VAT Act, so invoices
              carry no VAT line. Confirm the treatment of the staff contribution with your tax
              adviser before it is run through payroll.
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-body">Emissions avoided</h2>
            <p className="tabular mt-2 text-2xl font-semibold text-brand-bright">
              {metrics.co2SavedKg.toLocaleString("en-KE")} kg CO₂e
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Against the same journeys driven single-occupancy, using a 160 g/passenger-km
              difference. Suitable as an indicative figure for reporting, not as an audited one.
            </p>
          </Card>
        </div>
      </section>

      <Card>
        <CardHeader
          title="Line utilisation"
          subtitle="Your staff's share of the seats offered on each line"
        />
        {usage.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No trips in this period" body="Once staff start booking, line-by-line usage appears here." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
                  <th className="px-5 py-3 font-medium">Line</th>
                  <th className="px-5 py-3 font-medium">Corridor</th>
                  <th className="px-5 py-3 text-right font-medium">Seats used</th>
                  <th className="px-5 py-3 font-medium">Share of seats offered</th>
                  <th className="px-5 py-3 text-right font-medium">Employer spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {usage.map((row) => (
                  <tr key={row.route.id} className="text-muted">
                    <td className="whitespace-nowrap px-5 py-3">
                      <Link
                        href={`/routes/${row.route.slug}`}
                        className="transition-colors hover:text-brand-bright"
                      >
                        <span className="tabular text-brand-bright">{row.route.code}</span>{" "}
                        <span className="text-body">{row.route.name}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-xs">{row.route.corridor}</td>
                    <td className="tabular px-5 py-3 text-right">
                      {row.bookings.toLocaleString("en-KE")}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Meter
                          pct={row.utilisationPct}
                          tone={row.utilisationPct >= 60 ? "brand" : "sky"}
                          className="w-32"
                        />
                        <span className="tabular text-xs">{row.utilisationPct}%</span>
                      </div>
                    </td>
                    <td className="tabular whitespace-nowrap px-5 py-3 text-right text-body">
                      {formatKes(row.employerKes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Riders"
          subtitle={`${activeRiders.length} of ${riders.length} staff travelled in this period`}
        />
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
                <th className="px-5 py-3 font-medium">Employee</th>
                <th className="px-5 py-3 font-medium">Staff no.</th>
                <th className="px-5 py-3 text-right font-medium">Trips</th>
                <th className="px-5 py-3 text-right font-medium">Employer paid</th>
                <th className="px-5 py-3 text-right font-medium">Payroll deduction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {riders.slice(0, 60).map((row) => (
                <tr key={row.employee.id} className="text-muted">
                  <td className="px-5 py-3">
                    <span className="text-body">{row.employee.name}</span>
                    <span className="ml-2 text-xs text-faint">{row.employee.email}</span>
                  </td>
                  <td className="tabular whitespace-nowrap px-5 py-3 text-xs">
                    {row.employee.staffNo}
                  </td>
                  <td className="tabular px-5 py-3 text-right">{row.trips}</td>
                  <td className="tabular whitespace-nowrap px-5 py-3 text-right text-body">
                    {formatKes(row.employerKes)}
                  </td>
                  <td className="tabular whitespace-nowrap px-5 py-3 text-right">
                    {formatKes(row.employeeKes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {riders.length > 60 ? (
          <p className="border-t border-line px-5 py-3 text-xs text-faint">
            Showing the 60 highest-spend riders of {riders.length}.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
