import { redirect } from "next/navigation";

import { CheckIcon } from "@/components/icons";
import { PayForm } from "@/components/pay-form";
import { Card, EmptyTab, Eyebrow, HeroCard, Screen } from "@/components/rider";
import { getSession } from "@/lib/auth";
import { formatKes } from "@/lib/domain/fares";
import { formatPhone, normalisePhone } from "@/lib/domain/payments";
import { formatServiceDate } from "@/lib/domain/time";
import { paymentsForEmployee, unpaidFares, type RiderPayment } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Pay" };

/**
 * Tab 3 — Pay.
 *
 * Two halves and no more: is there anything I still owe, and what have I paid.
 * The first is the loud panel with the amount and the M-Pesa button; the
 * second is a quiet list under it that scrolls inside its own pane. When
 * nothing is owed the tab says so in one line rather than making somebody
 * read a ledger to find out.
 */
export default async function PayPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const { employee, company } = session;
  const owing = unpaidFares(employee.id);
  const paid = paymentsForEmployee(employee.id, 30).filter((p) => p.payment.status === "paid");

  const owed = owing.reduce((sum, p) => sum + p.payment.amountKes, 0);
  const next = owing[0];
  const phone = normalisePhone(employee.phone);
  const coveredByWork = paid
    .filter((p) => p.payment.method === "employer")
    .reduce((sum, p) => sum + p.payment.amountKes, 0);

  return (
    <Screen
      eyebrow={owing.length === 0 ? "All clear" : `${owing.length} to pay`}
      title={owing.length === 0 ? "Nothing owing" : formatKes(owed)}
    >
      {next ? (
        <HeroCard>
          <div className="space-y-4 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <Eyebrow onWash>Pay this one first</Eyebrow>
              <span className="tabular text-2xl font-bold text-white">
                {formatKes(next.payment.amountKes)}
              </span>
            </div>

            <div>
              <p className="truncate text-lg font-bold text-white">
                {next.boardStopName} → {next.alightStopName}
              </p>
              <p className="tabular truncate text-sm text-white/70">
                {formatServiceDate(next.serviceDate)} at {next.departTime} · bus {next.plate}
              </p>
            </div>

            <PayForm
              paymentId={next.payment.id}
              amountKes={next.payment.amountKes}
              defaultPhone={phone ? formatPhone(phone) : employee.phone}
            />
          </div>
        </HeroCard>
      ) : (
        <EmptyTab icon={<CheckIcon className="size-8" />} title="You're all paid up">
          {coveredByWork > 0
            ? `${company.name} has covered ${formatKes(coveredByWork)} of your fares. Nothing is waiting on your phone.`
            : "Nothing is waiting on your phone. A fare shows up here the moment you get on a bus."}
        </EmptyTab>
      )}

      {owing.length > 1 || paid.length > 0 ? (
        <Card grow className="overflow-hidden">
          <p className="shrink-0 px-4 pt-3 text-[0.68rem] font-bold uppercase tracking-[0.2em] text-faint">
            {owing.length > 1 ? "Also waiting" : "Already paid"}
          </p>
          <ul className="inner-scroll flex-1 divide-y divide-[var(--glass-edge)] px-4">
            {owing.slice(1).map((p) => (
              <Row key={p.payment.id} entry={p} owing />
            ))}
            {paid.map((p) => (
              <Row key={p.payment.id} entry={p} />
            ))}
          </ul>
        </Card>
      ) : null}
    </Screen>
  );
}

function Row({ entry, owing = false }: { entry: RiderPayment; owing?: boolean }) {
  const { payment } = entry;
  const free = payment.method === "employer";

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base text-body">
          {entry.boardStopName} → {entry.alightStopName}
        </span>
        <span className="block truncate text-xs text-faint">
          {formatServiceDate(entry.serviceDate)}
          {owing ? " · not paid yet" : free ? " · paid by your work" : ` · ${payment.reference}`}
        </span>
      </span>
      <span
        className={`tabular shrink-0 text-base font-bold ${owing ? "text-amber" : "text-body"}`}
      >
        {free ? "Free" : formatKes(payment.amountKes)}
      </span>
    </li>
  );
}
