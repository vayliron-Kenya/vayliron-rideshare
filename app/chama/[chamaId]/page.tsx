import { notFound, redirect } from "next/navigation";

import {
  acknowledgeAction,
  createProposalAction,
  createRequestAction,
  submitReceiptAction,
  voteAction,
} from "@/app/chama-actions";
import { ActionForm, Field, SelectField, TextAreaField } from "@/components/action-form";
import { ChamaTabs, Figure, KIND_LABEL, RoleBadge, StatusBadge, when } from "@/components/chama";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { actorFrom, getPrincipal } from "@/lib/auth";
import {
  constitutionHistory,
  ledger,
  listAnnouncements,
  listMembers,
  listProposals,
  listReceipts,
  listRequests,
  memberDashboard,
  RAILS,
  whoFromActor,
} from "@/lib/chama";
import { can, categoryFor, formatMoney } from "@/lib/domain/chama";

export const dynamic = "force-dynamic";
export const metadata = { title: "My chama" };

export default async function MemberPage({ params }: { params: Promise<{ chamaId: string }> }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/");
  if (principal.kind === "operator") redirect("/chama");
  const { chamaId } = await params;
  const me = whoFromActor(actorFrom(principal));

  const view = memberDashboard(chamaId, me.key);
  if (!view) notFound();
  if (view.member.status !== "active") {
    return <EmptyState title="You've left this chama" body="Your history stays on the group's books." />;
  }

  const { chama, member, standing } = view;
  const features = categoryFor(chama.category).features;
  const m = (minor: number) => formatMoney(minor, chama.currency);
  const names = new Map(listMembers(chamaId, true).map((x) => [x.key, x.name]));
  const nameOf = (key: string) => names.get(key) ?? "Former member";

  const constitution = constitutionHistory(chamaId)[0];
  const proposals = listProposals(chamaId, me.key);
  const myRequests = listRequests(chamaId, { beneficiary: me.key });
  const myReceipts = listReceipts(chamaId, { memberKey: me.key });
  const history = ledger(chamaId, me.key, 50);
  const announcements = listAnnouncements(chamaId, 5);
  const others = listMembers(chamaId).filter((x) => x.key !== me.key);
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  return (
    <div className="space-y-6">
      <ChamaTabs chamaId={chamaId} active="me" books={can(member.role, "view_books")} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-faint">{categoryFor(chama.category).label}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-body">{chama.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {m(chama.contributionMinor)} {chama.frequency} · next due {when(view.nextDue)} · {view.group.members} members
          </p>
        </div>
        <div className="flex gap-2"><RoleBadge role={member.role} /><StatusBadge status={chama.status} /></div>
      </header>

      {view.needsAcknowledgement ? (
        <Card className="border-amber/50 p-5">
          <p className="text-sm font-semibold text-body">The constitution changed — version {chama.constitutionVersion} was adopted by vote.</p>
          <p className="mt-1 text-sm text-muted">Read it below. Officers can&apos;t sign for the group until they accept it.</p>
          <ActionForm action={acknowledgeAction} submit={`Accept version ${chama.constitutionVersion}`}>
            {hidden("chamaId", chamaId)}
            {hidden("version", String(chama.constitutionVersion))}
          </ActionForm>
        </Card>
      ) : null}

      <section className="grid gap-3 grid-cols-2">
        <Figure label="You've contributed" value={m(standing.paidMinor)} hint={standing.expectedMinor === 0 ? `Nothing due until ${when(view.nextDue)}` : `of ${m(standing.expectedMinor)} due so far`} />
        <Figure
          label="Outstanding"
          value={m(standing.arrearsMinor + standing.lateFeesOutstandingMinor)}
          hint={
            standing.latePeriods > 0
              ? `${standing.latePeriods} late · ${m(standing.lateFeesOutstandingMinor)} in late fees`
              : standing.creditMinor > 0
                ? `${m(standing.creditMinor)} paid ahead`
                : "Up to date"
          }
        />
        {features.savings ? (
          <Figure
            label="Available to withdraw"
            value={m(view.availableMinor)}
            hint={`${m(view.savingsMinor)} saved · ${m(view.restrictedMinor)} held as reserve`}
          />
        ) : (
          <Figure label="Received from the group" value={m(view.receivedMinor)} hint="Payouts and support, confirmed" />
        )}
        {view.rotation ? (
          <Figure
            projected
            label="Your turn"
            value={view.rotation.roundsAway === 0 ? "This round" : `In ${view.rotation.roundsAway} round${view.rotation.roundsAway === 1 ? "" : "s"}`}
            hint={`About ${when(view.rotation.expectedOn)} · pot of ${m(view.rotation.potMinor)} if everyone pays`}
          />
        ) : (
          <Figure label="Group's confirmed balance" value={m(view.group.balanceMinor)} hint={`${m(view.group.reserveMinor)} is emergency reserve`} />
        )}
      </section>
      <p className="-mt-3 text-xs text-faint">
        Solid figures are confirmed money on the group&apos;s books. Dashed ones are projections from the rules and can change.
      </p>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Record a payment you made" subtitle="An officer checks it against the M-Pesa or bank statement before it counts." />
          <div className="p-5">
            <ActionForm action={submitReceiptAction} submit="Record payment" resetOnSuccess className="space-y-4">
              {hidden("chamaId", chamaId)}
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="For"
                  name="kind"
                  options={[
                    { value: "contribution", label: "Contribution" },
                    ...(chama.entryFeeMinor > 0 ? [{ value: "entry_fee", label: "Registration fee" }] : []),
                    ...(standing.lateFeesOutstandingMinor > 0 ? [{ value: "late_fee", label: "Late fee" }] : []),
                    ...(view.loans.some((l) => l.outstandingMinor > 0) ? [{ value: "loan_repayment", label: "Loan repayment" }] : []),
                  ]}
                />
                <Field label="Amount" name="amount" required defaultValue={(chama.contributionMinor / 100).toString()} />
                <SelectField label="Paid by" name="rail" options={RAILS.map((r) => ({ value: r.value, label: r.label }))} />
                <Field label="Reference" name="reference" required placeholder="M-Pesa code or slip ref" />
              </div>
              {view.loans.filter((l) => l.outstandingMinor > 0).map((l) => (
                <input key={l.loan.id} type="hidden" name="loanId" value={l.loan.id} />
              ))}
            </ActionForm>
            {myReceipts.length ? (
              <ul className="mt-5 divide-y divide-line text-sm">
                {myReceipts.slice(0, 6).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="text-body">{KIND_LABEL[r.kind]} · {m(r.amountMinor)}</span>
                      <span className="block truncate text-xs text-faint">{r.reference}{r.note ? ` — ${r.note}` : ""}</span>
                    </span>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Card>

        {features.lending || features.withdrawals || features.welfare ? (
          <Card>
            <CardHeader
              title="Ask the group for money"
              subtitle={`Needs ${chama.approvalsRequired} officers' signatures — never yours — before the treasurer sends it.`}
            />
            <div className="p-5">
              <ActionForm action={createRequestAction} submit="Send request" resetOnSuccess className="space-y-4">
                {hidden("chamaId", chamaId)}
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Type"
                    name="kind"
                    options={[
                      ...(features.lending ? [{ value: "loan", label: `Loan at ${chama.loanRateBps / 100}% a month` }] : []),
                      ...(features.withdrawals ? [{ value: "withdrawal", label: "Withdraw my savings" }] : []),
                      ...(features.welfare ? [{ value: "welfare", label: "Welfare support" }] : []),
                    ]}
                  />
                  <Field label="Amount" name="amount" required />
                  {features.lending ? <Field label="Months (loans)" name="months" type="number" defaultValue={3} min={1} max={36} /> : null}
                  {features.welfare ? (
                    <SelectField
                      label="For (welfare)"
                      name="beneficiary"
                      options={[{ value: me.key, label: "Me" }, ...others.map((o) => ({ value: o.key, label: o.name }))]}
                    />
                  ) : null}
                </div>
                <TextAreaField label="Reason" name="reason" rows={2} required />
              </ActionForm>
              {myRequests.length ? (
                <ul className="mt-5 divide-y divide-line text-sm">
                  {myRequests.slice(0, 6).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-body">{KIND_LABEL[r.kind]} · {m(r.amountMinor)}</span>
                      <StatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>

      {view.loans.length ? (
        <Card>
          <CardHeader title="Your loans" />
          <div className="divide-y divide-line">
            {view.loans.map((l) => (
              <div key={l.loan.id} className="px-5 py-4">
                <p className="text-sm text-body">
                  {m(l.loan.amountMinor)} over {l.loan.loanMonths} months · repaid {m(l.repaidMinor)} of {m(l.totalMinor)} ·{" "}
                  <span className="font-semibold">{m(l.outstandingMinor)} left</span>
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left uppercase tracking-wider text-faint">
                      <tr><th className="py-1">#</th><th>Due</th><th className="text-right">Principal</th><th className="text-right">Interest</th><th className="text-right">Total</th></tr>
                    </thead>
                    <tbody className="tabular text-muted">
                      {l.schedule.map((i) => (
                        <tr key={i.number} className={l.nextInstallment?.number === i.number ? "font-semibold text-body" : ""}>
                          <td className="py-1">{i.number}</td><td>{when(i.dueOn)}</td>
                          <td className="text-right">{m(i.principalMinor)}</td><td className="text-right">{m(i.interestMinor)}</td><td className="text-right">{m(i.totalMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="space-y-6">
        <Card>
          <CardHeader title="Votes" subtitle={`${chama.quorumBps / 100}% must take part; ${(chama.thresholdBps / 100).toFixed(0)}% of yes-or-no votes carries.`} />
          <div className="divide-y divide-line">
            {proposals.length === 0 ? <p className="px-5 py-4 text-sm text-faint">Nothing has been put to a vote.</p> : null}
            {proposals.map((p) => (
              <div key={p.id} className="space-y-2 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-body">{p.title}{p.kind === "amendment" ? " · amends the constitution" : ""}</p>
                  <StatusBadge status={p.status} />
                </div>
                {p.body ? <p className="text-sm text-muted">{p.body}</p> : null}
                {p.amendmentBody ? (
                  <details className="text-xs text-muted"><summary className="cursor-pointer">Proposed constitution text</summary><p className="mt-2 whitespace-pre-line">{p.amendmentBody}</p></details>
                ) : null}
                <p className="tabular text-xs text-faint">Yes {p.yes} · No {p.no} · Abstain {p.abstain} · closes {when(p.closesAt)}</p>
                {p.status === "open" && !p.myVote ? (
                  <div className="flex flex-wrap gap-2">
                    {(["yes", "no", "abstain"] as const).map((choice) => (
                      <ActionForm key={choice} action={voteAction} submit={choice[0].toUpperCase() + choice.slice(1)} tone={choice === "yes" ? "brand" : "quiet"} compact>
                        {hidden("chamaId", chamaId)}{hidden("proposalId", p.id)}{hidden("choice", choice)}
                      </ActionForm>
                    ))}
                  </div>
                ) : p.myVote ? <p className="text-xs text-muted">You voted {p.myVote}.</p> : null}
              </div>
            ))}
          </div>
          <details className="border-t border-line px-5 py-4">
            <summary className="cursor-pointer text-sm font-medium text-accent">Put something to a vote</summary>
            <ActionForm action={createProposalAction} submit="Propose" resetOnSuccess className="mt-4 space-y-3">
              {hidden("chamaId", chamaId)}
              <Field label="Title" name="title" required />
              <TextAreaField label="Details" name="body" rows={2} />
              <TextAreaField label="New constitution text (only if amending)" name="amendment" rows={4} />
              <Field label="Open for days" name="days" type="number" defaultValue={7} min={1} max={30} />
            </ActionForm>
          </details>
        </Card>

        <Card>
          <CardHeader title="Announcements" />
          <div className="divide-y divide-line">
            {announcements.length === 0 ? <p className="px-5 py-4 text-sm text-faint">No announcements yet.</p> : null}
            {announcements.map((a, i) => (
              <div key={i} className="px-5 py-3">
                <p className="whitespace-pre-line text-sm text-body">{a.body}</p>
                <p className="mt-1 text-xs text-faint">{a.authorName} · {when(a.at)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Your transactions" subtitle="Confirmed entries on the group's books. Each shows who recorded it and who confirmed it." />
        {history.length === 0 ? (
          <p className="px-5 py-4 text-sm text-faint">Nothing confirmed yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-faint">
                <tr><th className="px-5 py-2">Date</th><th className="px-5 py-2">What</th><th className="px-5 py-2">Reference</th><th className="px-5 py-2">Confirmed by</th><th className="px-5 py-2 text-right">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {history.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-5 py-2 text-muted">{when(e.at)}</td>
                    <td className="px-5 py-2 text-body">{KIND_LABEL[e.kind] ?? e.kind}</td>
                    <td className="px-5 py-2 font-mono text-xs text-muted">{e.reference}</td>
                    <td className="px-5 py-2 text-muted">{nameOf(e.confirmedBy)}</td>
                    <td className={`tabular whitespace-nowrap px-5 py-2 text-right ${e.direction === "in" ? "text-body" : "text-accent"}`}>
                      {e.direction === "in" ? "Paid in " : "Received "}{m(e.amountMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <details className="rounded-2xl border border-line bg-surface/80 px-5 py-4">
        <summary className="cursor-pointer text-sm font-medium text-body">Constitution · version {constitution.version}</summary>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted">{constitution.body}</p>
      </details>
    </div>
  );
}
