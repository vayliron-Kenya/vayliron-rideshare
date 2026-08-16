import { redirect } from "next/navigation";

import { Card, CardHeader, EmptyState, Meter, Stat } from "@/components/ui";
import { getOwnerSession } from "@/lib/auth";
import { formatKes } from "@/lib/domain/fares";
import { formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { ownerEarnings } from "@/lib/owners";

export const dynamic = "force-dynamic";

export const metadata = { title: "Earnings" };

/**
 * What the owner is owed.
 *
 * Two numbers matter and they are not the same number: what riders paid on
 * their buses, and what the owner keeps after commission. Showing only the
 * second hides the business; showing only the first overstates it. So both are
 * on the page, with the commission spelled out between them.
 */
export default async function EarningsPage() {
  const owner = await getOwnerSession();
  if (!owner) redirect("/");

  const today = nairobiDate();
  const from = `${today.slice(0, 7)}-01`;
  const earnings = ownerEarnings(owner.id, from, today);

  const best = earnings.byVehicle[0]?.ownerKes ?? 0;
  const busiestDay = [...earnings.byDay].sort((a, b) => b.ownerKes - a.ownerKes)[0];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-faint">{owner.name}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-body">Earnings</h1>
        <p className="mt-1 text-sm text-muted">
          {formatServiceDate(from)} to {formatServiceDate(today)} · paid out to{" "}
          {owner.phone} · KRA PIN {owner.kraPin}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Your share"
          value={formatKes(earnings.ownerKes)}
          tone="brand"
          hint={`${owner.payoutBps / 100}% of fares carried`}
        />
        <Stat
          label="Riders paid"
          value={formatKes(earnings.grossKes)}
          hint={`${earnings.riders.toLocaleString("en-KE")} fares on your buses`}
        />
        <Stat
          label="Vayliron commission"
          value={formatKes(earnings.commissionKes)}
          hint={`${(100 - owner.payoutBps / 100).toFixed(0)}% — network, app and payments`}
        />
        <Stat
          label="Still clearing"
          value={formatKes(earnings.pendingKes)}
          tone={earnings.pendingKes > 0 ? "amber" : "neutral"}
          hint={
            earnings.pendingKes > 0
              ? "M-Pesa pushes not yet confirmed"
              : "Everything has settled"
          }
        />
      </div>

      {earnings.riders === 0 ? (
        <EmptyState
          title="Nothing earned this month yet"
          body="Once one of your buses is approved and rostered onto a departure, every fare it carries shows up here."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="By bus"
              subtitle="Your share of the fares each unit carried"
            />
            <div className="divide-y divide-line">
              {earnings.byVehicle.map((v) => (
                <div key={v.plate} className="flex items-center gap-4 px-5 py-3.5">
                  <span className="tabular w-24 shrink-0 text-sm font-semibold text-body">
                    {v.plate}
                  </span>
                  <Meter pct={best === 0 ? 0 : Math.round((v.ownerKes / best) * 100)} className="flex-1" />
                  <span className="tabular w-20 shrink-0 text-right text-xs text-faint">
                    {v.riders.toLocaleString("en-KE")}
                  </span>
                  <span className="tabular w-28 shrink-0 text-right text-sm font-semibold text-body">
                    {formatKes(v.ownerKes)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Day by day"
              subtitle={
                busiestDay
                  ? `Best so far: ${formatServiceDate(busiestDay.date)}, ${formatKes(busiestDay.ownerKes)}`
                  : undefined
              }
            />
            <div className="max-h-[24rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
                    <th className="px-5 py-2.5 font-medium">Day</th>
                    <th className="px-5 py-2.5 text-right font-medium">Riders</th>
                    <th className="px-5 py-2.5 text-right font-medium">Fares</th>
                    <th className="px-5 py-2.5 text-right font-medium">Your share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...earnings.byDay].reverse().map((d) => (
                    <tr key={d.date} className="text-muted">
                      <td className="whitespace-nowrap px-5 py-2.5">
                        {formatServiceDate(d.date)}
                      </td>
                      <td className="tabular px-5 py-2.5 text-right">
                        {d.riders.toLocaleString("en-KE")}
                      </td>
                      <td className="tabular px-5 py-2.5 text-right">{formatKes(d.grossKes)}</td>
                      <td className="tabular px-5 py-2.5 text-right font-semibold text-body">
                        {formatKes(d.ownerKes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      <p className="text-xs leading-relaxed text-faint">
        Fares are split the moment a rider pays, at the rate agreed when the payment was taken —
        so a change to your rate never restates a month that has already closed. Payouts are
        arithmetic in this build; there is no live M-Pesa B2C behind them yet.
      </p>
    </div>
  );
}
