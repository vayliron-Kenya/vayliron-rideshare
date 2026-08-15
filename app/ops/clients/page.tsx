import { redirect } from "next/navigation";

import { updateContractAction } from "@/app/ops-actions";
import { ActionForm, Field } from "@/components/action-form";
import { SpendChart } from "@/components/spend-chart";
import { Badge, Card, CardHeader, Stat } from "@/components/ui";
import { getNetworkAdmin, getOperatorSession } from "@/lib/auth";
import { formatKes } from "@/lib/domain/fares";
import { addDays, formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { clientRevenue, dailyNetworkRevenue } from "@/lib/ops";

export const dynamic = "force-dynamic";

export const metadata = { title: "Clients" };

const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
] as const;

interface PageProps {
  searchParams: Promise<{ range?: string }>;
}

export default async function OpsClientsPage({ searchParams }: PageProps) {
  const operator = await getOperatorSession();
  if (!operator) redirect("/");
  const canEditContracts = Boolean(await getNetworkAdmin());

  const { range } = await searchParams;
  const days = RANGES.some((r) => r.key === range) ? Number(range) : 30;

  const today = nairobiDate();
  const from = addDays(today, -(days - 1));

  const clients = clientRevenue(from, today);
  const revenue = dailyNetworkRevenue(from, today);

  const total = clients.reduce((sum, c) => sum + c.revenueKes, 0);
  const trips = clients.reduce((sum, c) => sum + c.trips, 0);
  const riders = clients.reduce((sum, c) => sum + c.activeRiders, 0);
  const headcount = clients.reduce((sum, c) => sum + c.headcount, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-body">Clients</h1>
          <p className="mt-1 text-sm text-muted">
            {formatServiceDate(from)} – {formatServiceDate(today)} · {clients.length} corporate
            accounts
          </p>
        </div>
        <div className="flex rounded-xl border border-edge p-1">
          {RANGES.map((option) => (
            <a
              key={option.key}
              href={`/ops/clients?range=${option.key}`}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                String(days) === option.key
                  ? "bg-raised font-medium text-body"
                  : "text-muted hover:text-body"
              }`}
            >
              {option.label}
            </a>
          ))}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Fare revenue" value={formatKes(total)} tone="brand" />
        <Stat label="Trips sold" value={trips.toLocaleString("en-KE")} />
        <Stat
          label="Riders"
          value={`${riders} / ${headcount}`}
          hint={`${headcount === 0 ? 0 : Math.round((riders / headcount) * 100)}% of contracted headcount`}
        />
        <Stat
          label="Revenue per rider"
          value={formatKes(riders === 0 ? 0 : Math.round(total / riders))}
          hint="Across the selected period"
        />
      </section>

      <Card>
        <CardHeader
          title="Network revenue"
          subtitle="Total fares, employer and rider shares combined"
        />
        <SpendChart points={revenue} />
      </Card>

      <div className="space-y-4">
        {clients.map((client) => (
          <Card key={client.company.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-body">{client.company.name}</h2>
                <p className="mt-0.5 text-xs text-faint">
                  @{client.company.emailDomain} · KRA PIN {client.company.kraPin} · billed to{" "}
                  {client.company.billingEmail}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="brand">{formatKes(client.revenueKes)}</Badge>
                <Badge>{client.trips.toLocaleString("en-KE")} trips</Badge>
                <Badge>
                  {client.activeRiders} / {client.headcount} riding
                </Badge>
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_20rem]">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="Employer share" value={`${client.company.subsidyBps / 100}%`} />
                <Metric
                  label="Monthly cap"
                  value={
                    client.company.monthlyCapKes > 0
                      ? formatKes(client.company.monthlyCapKes)
                      : "Uncapped"
                  }
                />
                <Metric
                  label="Revenue per head"
                  value={formatKes(
                    client.headcount === 0 ? 0 : Math.round(client.revenueKes / client.headcount),
                  )}
                />
                <Metric
                  label="Adoption"
                  value={`${
                    client.headcount === 0
                      ? 0
                      : Math.round((client.activeRiders / client.headcount) * 100)
                  }%`}
                />
              </dl>

              {canEditContracts ? (
                <div className="rounded-xl border border-line bg-ink/40 p-4">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-faint">
                    Contract terms
                  </h3>
                  <ActionForm
                    action={updateContractAction}
                    submit="Update contract"
                    className="mt-3 space-y-3"
                  >
                    <input type="hidden" name="companyId" value={client.company.id} />
                    <Field
                      label="Employer share %"
                      name="subsidyPct"
                      type="number"
                      min={0}
                      max={100}
                      step="1"
                      defaultValue={client.company.subsidyBps / 100}
                    />
                    <Field
                      label="Monthly cap per employee (KSh)"
                      name="monthlyCapKes"
                      type="number"
                      min={0}
                      defaultValue={client.company.monthlyCapKes}
                      hint="0 means uncapped."
                    />
                  </ActionForm>
                </div>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-faint">{label}</dt>
      <dd className="tabular mt-1 text-sm font-medium text-body">{value}</dd>
    </div>
  );
}
