import { updatePolicyAction } from "@/app/company-actions";
import { ActionForm, Field } from "@/components/action-form";
import { CompanyTabs } from "@/components/company-tabs";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { getCompanyAdmin } from "@/lib/auth";
import { FARE_BANDS, formatKes, splitFare } from "@/lib/domain/fares";

export const dynamic = "force-dynamic";

export const metadata = { title: "Policy" };

export default async function CompanyPolicyPage() {
  const session = await getCompanyAdmin();
  if (!session) {
    return (
      <EmptyState
        title="Admins only"
        body="The subsidy policy is set by the HR admins on your Vayliron account."
      />
    );
  }

  const { company } = session;

  return (
    <div className="space-y-6">
      <CompanyTabs active="policy" />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-body">Commuter policy</h1>
        <p className="mt-1 text-sm text-muted">
          What {company.name} pays towards each seat, and where the bill goes
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-body">Terms</h2>
          <ActionForm action={updatePolicyAction} submit="Save policy" className="mt-4 space-y-3">
            <Field
              label="Employer share %"
              name="subsidyPct"
              type="number"
              min={0}
              max={100}
              step="1"
              defaultValue={company.subsidyBps / 100}
              hint="The rest is deducted from the rider's payroll."
            />
            <Field
              label="Monthly cap per employee (KSh)"
              name="monthlyCapKes"
              type="number"
              min={0}
              defaultValue={company.monthlyCapKes}
              hint="0 means uncapped. Once someone hits the cap, the balance moves to them."
            />
            <Field
              label="Billing email"
              name="billingEmail"
              type="email"
              defaultValue={company.billingEmail}
              hint="Where the monthly invoice is sent."
            />
          </ActionForm>

          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-faint">
            Changing the policy affects seats booked from now on. Trips already booked keep the
            split they were quoted — a rider who was told a fare of KSh 0 is not billed later.
          </p>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="What each zone costs your staff"
              subtitle={`At a ${company.subsidyBps / 100}% employer share${
                company.monthlyCapKes > 0
                  ? `, before anyone reaches the ${formatKes(company.monthlyCapKes)} monthly cap`
                  : ""
              }`}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
                    <th className="px-5 py-3 font-medium">Zone</th>
                    <th className="px-5 py-3 text-right font-medium">Fare</th>
                    <th className="px-5 py-3 text-right font-medium">{company.name} pays</th>
                    <th className="px-5 py-3 text-right font-medium">Rider pays</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {FARE_BANDS.map((band) => {
                    const split = splitFare({
                      fareKes: band.fareKes,
                      subsidyBps: company.subsidyBps,
                    });
                    return (
                      <tr key={band.label} className="text-muted">
                        <td className="px-5 py-3">{band.label}</td>
                        <td className="tabular px-5 py-3 text-right">
                          {formatKes(band.fareKes)}
                        </td>
                        <td className="tabular px-5 py-3 text-right text-brand-bright">
                          {formatKes(split.employerKes)}
                        </td>
                        <td className="tabular px-5 py-3 text-right text-body">
                          {formatKes(split.employeeKes)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-body">Monthly exposure</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              A rider commuting twice a day, 22 working days a month, on a Zone C leg costs{" "}
              <span className="tabular text-body">
                {formatKes(
                  splitFare({ fareKes: 300, subsidyBps: company.subsidyBps }).employerKes * 44,
                )}
              </span>{" "}
              in employer share.
              {company.monthlyCapKes > 0 ? (
                <>
                  {" "}
                  Your {formatKes(company.monthlyCapKes)} cap stops that at{" "}
                  <span className="tabular text-body">{formatKes(company.monthlyCapKes)}</span>, so
                  a heavy commuter picks up the rest themselves.
                </>
              ) : (
                " With no cap set, that is your full exposure per heavy commuter."
              )}
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-body">Billing</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Invoice recipient</dt>
                <dd className="text-body">{company.billingEmail}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">KRA PIN</dt>
                <dd className="tabular text-body">{company.kraPin}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">Staff email domain</dt>
                <dd className="text-body">@{company.emailDomain}</dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-faint">
              Road passenger transport is an exempt supply under Kenya&apos;s VAT Act, so invoices
              carry no VAT line. The KRA PIN and email domain are set by Vayliron — ask your account
              contact to change either.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
