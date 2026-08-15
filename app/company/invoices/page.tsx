import Link from "next/link";

import { CompanyTabs } from "@/components/company-tabs";
import { Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { getCompanyAdmin } from "@/lib/auth";
import { formatKes } from "@/lib/domain/fares";
import { nairobiDate } from "@/lib/domain/time";
import { monthlyInvoice } from "@/lib/ops";

export const dynamic = "force-dynamic";

export const metadata = { title: "Invoices" };

const MONTH_LABEL = new Intl.DateTimeFormat("en-KE", {
  timeZone: "Africa/Nairobi",
  month: "long",
  year: "numeric",
});

function monthName(month: string): string {
  return MONTH_LABEL.format(new Date(`${month}-15T12:00:00+03:00`));
}

/** The last six months, newest first. */
function recentMonths(from: string, count = 6): string[] {
  const [year, month] = from.split("-").map(Number);
  const months: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(Date.UTC(year, month - 1 - i, 15));
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

export default async function CompanyInvoicesPage({ searchParams }: PageProps) {
  const session = await getCompanyAdmin();
  if (!session) {
    return (
      <EmptyState
        title="Admins only"
        body="Invoices are visible to the HR and finance admins on your Vayliron account."
      />
    );
  }

  const { month } = await searchParams;
  const today = nairobiDate();
  const months = recentMonths(today.slice(0, 7));
  const selected = month && /^\d{4}-\d{2}$/.test(month) ? month : months[0];

  const invoice = monthlyInvoice(session.company.id, selected);
  if (!invoice) {
    return <EmptyState title="No account" body="This company account could not be loaded." />;
  }

  const isCurrentMonth = selected === today.slice(0, 7);
  const perRider =
    invoice.lines.length === 0
      ? 0
      : Math.round(invoice.employerTotalKes / invoice.lines.length);

  return (
    <div className="space-y-6">
      <CompanyTabs active="invoices" />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-body">
            Invoice · {monthName(selected)}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {session.company.name} · KRA PIN {session.company.kraPin} · billed to{" "}
            {session.company.billingEmail}
          </p>
        </div>
        <a
          href={`/api/company/invoice.csv?month=${selected}`}
          className="rounded-xl border border-edge px-4 py-2 text-sm text-muted transition-colors hover:border-brand/60 hover:text-accent"
        >
          Download CSV
        </a>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {months.map((option) => (
          <Link
            key={option}
            href={`/company/invoices?month=${option}`}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              option === selected
                ? "border-brand/60 bg-brand-soft text-accent"
                : "border-edge text-muted hover:text-body"
            }`}
          >
            {monthName(option)}
          </Link>
        ))}
      </div>

      {isCurrentMonth ? (
        <Card className="px-5 py-3">
          <p className="text-xs text-amber">
            This month is still running — the total will keep moving until the last departure of the
            month has been closed out.
          </p>
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Amount due"
          value={formatKes(invoice.employerTotalKes)}
          tone="brand"
          hint="Employer share of every trip taken"
        />
        <Stat label="Trips billed" value={invoice.trips.toLocaleString("en-KE")} />
        <Stat label="Riders" value={invoice.lines.length} hint={`${formatKes(perRider)} average`} />
        <Stat
          label="Payroll deductions"
          value={formatKes(invoice.employeeTotalKes)}
          hint="Collected from staff, not billed to you"
        />
      </section>

      <Card>
        <CardHeader
          title="Lines"
          subtitle="Every rider who travelled this month, highest employer cost first"
        />
        {invoice.lines.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nothing billed this month"
              body="No completed trips fall in this period, so there is nothing to invoice."
            />
          </div>
        ) : (
          <div className="max-h-[40rem] overflow-auto">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
                  <th className="px-5 py-3 font-medium">Employee</th>
                  <th className="px-5 py-3 font-medium">Staff no.</th>
                  <th className="px-5 py-3 text-right font-medium">Trips</th>
                  <th className="px-5 py-3 text-right font-medium">Employer</th>
                  <th className="px-5 py-3 text-right font-medium">Payroll</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoice.lines.map((line) => (
                  <tr key={line.employeeId} className="text-muted">
                    <td className="px-5 py-3 text-body">{line.name}</td>
                    <td className="tabular whitespace-nowrap px-5 py-3 text-xs">{line.staffNo}</td>
                    <td className="tabular px-5 py-3 text-right">{line.trips}</td>
                    <td className="tabular whitespace-nowrap px-5 py-3 text-right text-body">
                      {formatKes(line.employerKes)}
                    </td>
                    <td className="tabular whitespace-nowrap px-5 py-3 text-right">
                      {formatKes(line.employeeKes)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-edge text-body">
                  <td className="px-5 py-3 font-semibold" colSpan={2}>
                    Total
                  </td>
                  <td className="tabular px-5 py-3 text-right font-semibold">{invoice.trips}</td>
                  <td className="tabular px-5 py-3 text-right font-semibold text-accent">
                    {formatKes(invoice.employerTotalKes)}
                  </td>
                  <td className="tabular px-5 py-3 text-right font-semibold">
                    {formatKes(invoice.employeeTotalKes)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Card className="px-5 py-4">
        <p className="text-xs leading-relaxed text-faint">
          Trips are billed once they have been closed out at the door — both boarded seats and
          no-shows, because the seat was held either way. Cancelled seats are never billed. Road
          passenger transport is VAT-exempt in Kenya, so no VAT is charged on this invoice.
        </p>
      </Card>
    </div>
  );
}
