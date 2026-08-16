import { redirect } from "next/navigation";

import { CheckIcon } from "@/components/icons";
import { PayForm } from "@/components/pay-form";
import { Card, EmptyTab, Eyebrow, HeroCard, TabHead } from "@/components/rider";
import { getSession } from "@/lib/auth";
import { formatKes } from "@/lib/domain/fares";
import { formatPhone, normalisePhone, PAYMENT_METHOD_LABEL } from "@/lib/domain/payments";
import { formatServiceDate } from "@/lib/domain/time";
import { paymentsForEmployee, unpaidFares, type RiderPayment } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Pay" };

/**
 * Tab 3 — Pay.
 *
 * A rider's money question has exactly two halves: is there anything I still
 * owe, and what have I paid. The first is the loud card at the top with the
 * amount and the M-Pesa button; the second is a quiet list underneath. When
 * nothing is owed the tab says so in one line rather than making someone read
 * a ledger to find out.
 */
export default async function PayPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const { employee, company } = session;
  const owing = unpaidFares(employee.id);
  const history = paymentsForEmployee(employee.id, 30).filter(
    (p) => p.payment.status === "paid",
  );

  const owed = owing.reduce((sum, p) => sum + p.payment.amountKes, 0);
  const next = owing[0];
  const defaultPhone = normalisePhone(employee.phone) ?? "";

  const coveredThisMonth = history
    .filter((p) => p.payment.method === "employer")
    .reduce((sum, p) => sum + p.payment.amountKes, 0);

  return (
    <div className="space-y-5">
      <TabHead
        eyebrow={owing.length === 0 ? "Nothing owing" : `${owing.length} to pay`}
        title="Pay"
      />

      {next ? (
        <>
          <HeroCard>
            <div className="space-y-5 p-6">
              <Eyebrow onWash>You owe</Eyebrow>
              <div>
                <p className="clock text-white">{formatKes(owed)}</p>
                <p className="mt-1 text-lg text-white/85">
                  {owing.length === 1
                    ? "for one ride"
                    : `across ${owing.length} rides`}
                </p>
              </div>

              <div className="space-y-1 border-t border-white/20 pt-4">
                <p className="text-base text-white">
                  {next.routeCode} · {next.boardStopName} → {next.alightStopName}
                </p>
                <p className="tabular text-sm text-white/70">
                  {formatServiceDate(next.serviceDate)} at {next.departTime} · {next.plate}
                </p>
              </div>
            </div>
          </HeroCard>

          <Card className="px-5 py-5">
            <Eyebrow>Pay the oldest first</Eyebrow>
            <p className="mt-1 mb-4 text-base text-muted">
              {formatKes(next.payment.amountKes)} for your {next.boardStopName} ride on{" "}
              {formatServiceDate(next.serviceDate)}.
            </p>
            <PayForm
              paymentId={next.payment.id}
              amountKes={next.payment.amountKes}
              defaultPhone={defaultPhone ? formatPhone(defaultPhone) : employee.phone}
            />
          </Card>

          {owing.length > 1 ? (
            <Card className="px-5 py-4">
              <Eyebrow>Also waiting</Eyebrow>
              <ul className="mt-2 divide-y divide-line">
                {owing.slice(1).map((p) => (
                  <li key={p.payment.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base text-body">
                        {p.boardStopName} → {p.alightStopName}
                      </span>
                      <span className="block text-xs text-faint">
                        {formatServiceDate(p.serviceDate)} · {p.routeCode}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-base font-bold text-body">
                      {formatKes(p.payment.amountKes)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : (
        <EmptyTab icon={<CheckIcon className="size-7" />} title="You are all paid up">
          {coveredThisMonth > 0
            ? `${company.name} has covered ${formatKes(coveredThisMonth)} of fares for you. Nothing is waiting on your phone.`
            : "Nothing is waiting on your phone. Fares appear here the moment you take a place on a bus."}
        </EmptyTab>
      )}

      {history.length > 0 ? (
        <Card className="px-5 py-4">
          <Eyebrow>Paid</Eyebrow>
          <ul className="mt-2 divide-y divide-line">
            {history.slice(0, 12).map((p) => (
              <Receipt key={p.payment.id} entry={p} />
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="px-1 pb-2 text-xs leading-relaxed text-faint">
        Fares go to the owner of the bus you rode, less Vayliron&apos;s commission for the network
        and the app. No M-Pesa credentials are wired into this build, so receipts here are minted
        in Safaricom&apos;s shape rather than returned by it.
      </p>
    </div>
  );
}

function Receipt({ entry }: { entry: RiderPayment }) {
  const { payment } = entry;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base text-body">
          {entry.boardStopName} → {entry.alightStopName}
        </span>
        <span className="block truncate text-xs text-faint">
          {formatServiceDate(entry.serviceDate)} ·{" "}
          {payment.reference ?? PAYMENT_METHOD_LABEL[payment.method]}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tabular block text-base font-semibold text-body">
          {payment.method === "employer" ? "Free" : formatKes(payment.amountKes)}
        </span>
        <span className="block text-xs text-faint">
          {payment.method === "employer" ? "employer" : "M-Pesa"}
        </span>
      </span>
    </li>
  );
}
