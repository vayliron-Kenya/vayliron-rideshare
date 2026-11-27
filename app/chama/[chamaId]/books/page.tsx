import { notFound, redirect } from "next/navigation";

import {
  announceAction,
  assignRoleAction,
  createRequestAction,
  decideReceiptAction,
  decideRequestAction,
  executeRequestAction,
  submitReceiptAction,
} from "@/app/chama-actions";
import { ActionForm, Field, SelectField, TextAreaField } from "@/components/action-form";
import { ChamaTabs, Figure, KIND_LABEL, RoleBadge, StatusBadge, when } from "@/components/chama";
import { Card, CardHeader, EmptyState, Meter } from "@/components/ui";
import { actorFrom, getPrincipal } from "@/lib/auth";
import {
  canConfirmReceipt,
  constitutionHistory,
  getMember,
  groupDashboard,
  ledger,
  RAILS,
  signatoriesFor,
  whoFromActor,
} from "@/lib/chama";
import { approvalState, can, canSign, categoryFor, CHAMA_ROLES, formatMoney, ROLE_LABEL } from "@/lib/domain/chama";

export const dynamic = "force-dynamic";
export const metadata = { title: "Group books" };

export default async function BooksPage({ params }: { params: Promise<{ chamaId: string }> }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/");
  if (principal.kind === "operator") redirect("/chama");
  const { chamaId } = await params;
  const me = whoFromActor(actorFrom(principal));
  const member = getMember(chamaId, me.key);
  if (!member || member.status !== "active") notFound();
  if (!can(member.role, "view_books")) {
    return (
      <div className="space-y-6">
        <ChamaTabs chamaId={chamaId} active="books" books={false} />
        <EmptyState title="Officers only" body="The group books are open to the chairperson, treasurer, secretary, loan officer and auditor." />
      </div>
    );
  }

  const view = groupDashboard(chamaId)!;
  const { chama } = view;
  const features = categoryFor(chama.category).features;
  const m = (minor: number) => formatMoney(minor, chama.currency);
  const names = new Map(view.members.map((x) => [x.key, x.name]));
  const nameOf = (key: string) => names.get(key) ?? "Former member";
  const signatories = signatoriesFor(chamaId);
  const collection = view.expectedMinor === 0 ? 0 : Math.round((view.collectedMinor / view.expectedMinor) * 100);
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  const history = ledger(chamaId, undefined, 40);
  const versions = constitutionHistory(chamaId);
  const outsideRules = member.acknowledgedVersion < chama.constitutionVersion;

  return (
    <div className="space-y-6">
      <ChamaTabs chamaId={chamaId} active="books" books />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-faint">Group books · you are {ROLE_LABEL[member.role].toLowerCase()}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-body">{chama.name}</h1>
          <p className="mt-1 text-sm text-muted">
            Invitation code <span className="font-mono font-semibold tracking-widest text-body">{chama.inviteCode}</span> · {view.members.length} of {chama.maxMembers} members
            {chama.status === "forming" ? ` · active at ${chama.minMembers}` : ""}
          </p>
        </div>
        <StatusBadge status={chama.status} />
      </header>

      {outsideRules ? (
        <p className="rounded-xl bg-amber-soft px-4 py-3 text-sm text-amber">
          Accept constitution v{chama.constitutionVersion} on your position page before you confirm or sign anything.
        </p>
      ) : null}

      <section className="grid gap-3 grid-cols-2">
        <Figure label="Confirmed balance" value={m(view.balanceMinor)} hint={`${m(view.reserveMinor)} reserve · ${m(view.availableMinor)} available`} />
        <div className="rounded-2xl border border-line bg-surface/80 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-faint">Collected</p>
          {view.expectedMinor === 0 ? (
            <>
              <p className="tabular mt-2 text-xl font-semibold text-body">Nothing due yet</p>
              <p className="mt-1 text-xs text-muted">
                First contribution {when(chama.anchorDate)} · {m(view.collectedMinor)} paid ahead
              </p>
            </>
          ) : (
            <>
              <p className="tabular mt-2 text-xl font-semibold text-body">{collection}%</p>
              <Meter pct={collection} className="mt-2" tone={collection < 80 ? "amber" : "brand"} />
              <p className="mt-1 text-xs text-muted">{m(view.collectedMinor)} of {m(view.expectedMinor)} due</p>
            </>
          )}
        </div>
        <Figure label="Arrears" value={m(view.arrearsMinor)} hint={`${view.members.filter((x) => x.standing.arrearsMinor > 0).length} members behind`} />
        <Figure label="Loans outstanding" value={m(view.loansOutstandingMinor)} hint="Principal and interest still owed" />
      </section>

      <Card>
        <CardHeader title="Payments waiting for confirmation" subtitle="Check each against the M-Pesa or bank statement. You can't confirm your own, or one you entered." />
        {view.pendingReceipts.length === 0 ? (
          <p className="px-5 py-4 text-sm text-faint">Nothing waiting.</p>
        ) : (
          <div className="divide-y divide-line">
            {view.pendingReceipts.map((r) => {
              const allowed = canConfirmReceipt(member, r) && !outsideRules;
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 text-sm">
                    <p className="text-body">{nameOf(r.memberKey)} · {KIND_LABEL[r.kind]} · <span className="tabular font-semibold">{m(r.amountMinor)}</span></p>
                    <p className="text-xs text-faint">{RAILS.find((x) => x.value === r.rail)?.label} <span className="font-mono">{r.reference}</span> · entered by {nameOf(r.submittedBy)} {when(r.submittedAt)}</p>
                  </div>
                  {allowed ? (
                    <div className="flex flex-wrap items-start gap-2">
                      <ActionForm action={decideReceiptAction} submit="Confirm" compact>
                        {hidden("chamaId", chamaId)}{hidden("receiptId", r.id)}{hidden("decision", "confirm")}
                      </ActionForm>
                      <ActionForm action={decideReceiptAction} submit="Reject" tone="quiet" compact>
                        {hidden("chamaId", chamaId)}{hidden("receiptId", r.id)}{hidden("decision", "reject")}
                        <input name="note" placeholder="Why?" className="w-32 rounded-lg border border-edge bg-ink px-2 py-1 text-xs text-body" />
                      </ActionForm>
                    </div>
                  ) : (
                    <span className="text-xs text-faint">Another officer confirms this</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Money out — waiting" subtitle={`${chama.approvalsRequired} signatures from officers who are neither the requester nor the recipient, then the treasurer records the payment reference.`} />
        {view.openRequests.length === 0 ? (
          <p className="px-5 py-4 text-sm text-faint">No requests open.</p>
        ) : (
          <div className="divide-y divide-line">
            {view.openRequests.map((r) => {
              const rules = { required: chama.approvalsRequired, requestedBy: r.requestedBy, beneficiary: r.beneficiary, signatories };
              const state = approvalState({ ...rules, decisions: r.decisions });
              const signed = r.decisions.some((d) => d.approver === me.key);
              const mayExecute = r.status === "approved" && can(member.role, "execute_request") && r.beneficiary !== me.key && !outsideRules;
              return (
                <div key={r.id} className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="text-sm">
                      <p className="text-body">
                        {KIND_LABEL[r.kind]}{r.round !== null ? ` · round ${r.round + 1}` : ""} to {nameOf(r.beneficiary)} · <span className="tabular font-semibold">{m(r.amountMinor)}</span>
                        {r.loanMonths ? ` over ${r.loanMonths} months` : ""}
                      </p>
                      <p className="text-xs text-faint">“{r.reason}” · asked by {nameOf(r.requestedBy)} {when(r.requestedAt)}</p>
                      <p className="text-xs text-muted">
                        Signed by {r.decisions.filter((d) => d.decision === "approve").map((d) => nameOf(d.approver)).join(", ") || "nobody yet"}
                        {state.state === "pending" ? ` · ${state.needed} more needed` : ""}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  {r.status === "pending" && !signed && canSign(rules, me.key) && !outsideRules ? (
                    <div className="flex gap-2">
                      <ActionForm action={decideRequestAction} submit="Sign" compact>
                        {hidden("chamaId", chamaId)}{hidden("requestId", r.id)}{hidden("decision", "approve")}
                      </ActionForm>
                      <ActionForm action={decideRequestAction} submit="Refuse" tone="quiet" compact>
                        {hidden("chamaId", chamaId)}{hidden("requestId", r.id)}{hidden("decision", "reject")}
                      </ActionForm>
                    </div>
                  ) : null}
                  {mayExecute ? (
                    <ActionForm action={executeRequestAction} submit="Record as sent" className="grid max-w-xl gap-3 sm:grid-cols-2">
                      {hidden("chamaId", chamaId)}{hidden("requestId", r.id)}
                      <SelectField label="Sent by" name="rail" options={RAILS.map((x) => ({ value: x.value, label: x.label }))} />
                      <Field label="Reference" name="reference" required placeholder="M-Pesa code or bank ref" />
                    </ActionForm>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        {features.rotation && can(member.role, "start_payout") ? (
          <div className="border-t border-line px-5 py-4">
            <ActionForm action={createRequestAction} submit={`Start payout for round ${(view.schedule[0]?.round ?? 0) + 1}`} tone="quiet">
              {hidden("chamaId", chamaId)}{hidden("kind", "payout")}
              <p className="text-sm text-muted">
                Next in line: <span className="font-medium text-body">{view.schedule[0] ? nameOf(view.schedule[0].memberKey) : "—"}</span>, a pot of{" "}
                {m(chama.contributionMinor * view.members.length)}.
              </p>
            </ActionForm>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Members" subtitle="Standing against the contribution calendar." />
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-faint">
              <tr>
                {features.rotation ? <th className="px-5 py-2">Turn</th> : null}
                <th className="px-5 py-2">Member</th><th className="px-5 py-2">Role</th>
                <th className="px-5 py-2 text-right">Paid</th><th className="px-5 py-2 text-right">Arrears</th>
                {features.savings ? <th className="px-5 py-2 text-right">Savings</th> : null}
                {features.lending ? <th className="px-5 py-2 text-right">Loan owed</th> : null}
                <th className="px-5 py-2">Constitution</th>
                {can(member.role, "assign_roles") ? <th className="px-5 py-2">Change role</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {view.members.map((x) => (
                <tr key={x.key}>
                  {features.rotation ? <td className="tabular px-5 py-2 text-muted">{(view.schedule.findIndex((s) => s.memberKey === x.key) + 1) || "—"}</td> : null}
                  <td className="px-5 py-2 text-body">{x.name}</td>
                  <td className="px-5 py-2"><RoleBadge role={x.role} /></td>
                  <td className="tabular px-5 py-2 text-right text-body">{m(x.standing.paidMinor)}</td>
                  <td className={`tabular px-5 py-2 text-right ${x.standing.arrearsMinor > 0 ? "text-flame" : "text-muted"}`}>
                    {m(x.standing.arrearsMinor)}{x.standing.latePeriods ? ` (${x.standing.latePeriods} late)` : ""}
                  </td>
                  {features.savings ? <td className="tabular px-5 py-2 text-right text-muted">{m(x.savingsMinor)}</td> : null}
                  {features.lending ? <td className="tabular px-5 py-2 text-right text-muted">{m(x.owedMinor)}</td> : null}
                  <td className="px-5 py-2 text-xs text-muted">v{x.acknowledgedVersion}{x.acknowledgedVersion < chama.constitutionVersion ? " — not yet accepted" : ""}</td>
                  {can(member.role, "assign_roles") ? (
                    <td className="px-5 py-2">
                      {x.key !== me.key && x.role !== "chairperson" ? (
                        <ActionForm action={assignRoleAction} submit="Set" compact>
                          {hidden("chamaId", chamaId)}{hidden("memberKey", x.key)}
                          <select name="role" defaultValue={x.role} className="rounded-lg border border-edge bg-ink px-2 py-1 text-xs text-body">
                            {CHAMA_ROLES.filter((r) => r !== "chairperson").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                          </select>
                        </ActionForm>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="space-y-6">
        {can(member.role, "confirm_receipt") ? (
          <Card>
            <CardHeader title="Record a payment for a member" subtitle="Cash taken at a meeting, or a transfer you've seen. Another officer confirms it." />
            <div className="p-5">
              <ActionForm action={submitReceiptAction} submit="Record" resetOnSuccess className="grid gap-4 sm:grid-cols-2">
                {hidden("chamaId", chamaId)}
                <SelectField label="Member" name="memberKey" options={view.members.map((x) => ({ value: x.key, label: x.name }))} />
                <SelectField label="For" name="kind" options={[{ value: "contribution", label: "Contribution" }, { value: "entry_fee", label: "Registration fee" }, { value: "late_fee", label: "Late fee" }]} />
                <Field label="Amount" name="amount" required defaultValue={(chama.contributionMinor / 100).toString()} />
                <SelectField label="Paid by" name="rail" options={RAILS.map((x) => ({ value: x.value, label: x.label }))} />
                <div className="sm:col-span-2"><Field label="Reference" name="reference" required /></div>
              </ActionForm>
            </div>
          </Card>
        ) : null}
        {can(member.role, "post_announcement") ? (
          <Card>
            <CardHeader title="Announce to members" />
            <div className="p-5">
              <ActionForm action={announceAction} submit="Post" resetOnSuccess>
                {hidden("chamaId", chamaId)}
                <TextAreaField label="Message" name="body" rows={4} required />
              </ActionForm>
            </div>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader title="Group ledger" subtitle="Append-only. A correction is a new entry; nothing here can be edited or deleted." />
        {history.length === 0 ? (
          <p className="px-5 py-4 text-sm text-faint">No confirmed entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-faint">
                <tr><th className="px-5 py-2">Date</th><th className="px-5 py-2">Member</th><th className="px-5 py-2">What</th><th className="px-5 py-2">Reference</th><th className="px-5 py-2">Recorded / confirmed</th><th className="px-5 py-2 text-right">In</th><th className="px-5 py-2 text-right">Out</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {history.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-5 py-2 text-muted">{when(e.at)}</td>
                    <td className="px-5 py-2 text-body">{nameOf(e.memberKey)}</td>
                    <td className="px-5 py-2 text-muted">{KIND_LABEL[e.kind] ?? e.kind}</td>
                    <td className="px-5 py-2 font-mono text-xs text-muted">{e.reference}</td>
                    <td className="px-5 py-2 text-xs text-muted">{nameOf(e.recordedBy)} / {nameOf(e.confirmedBy)}</td>
                    <td className="tabular px-5 py-2 text-right text-body">{e.direction === "in" ? m(e.amountMinor) : ""}</td>
                    <td className="tabular px-5 py-2 text-right text-accent">{e.direction === "out" ? m(e.amountMinor) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Constitution history" subtitle="Every version is kept. Amendments are adopted only by a vote of members." />
        <div className="divide-y divide-line">
          {versions.map((v) => (
            <details key={v.version} className="px-5 py-3">
              <summary className="cursor-pointer text-sm text-body">
                Version {v.version} · adopted {when(v.adoptedAt)} {v.adoptedBy.startsWith("vote:") ? "by vote" : `by ${nameOf(v.adoptedBy)}`}
              </summary>
              <p className="mt-2 whitespace-pre-line text-sm text-muted">{v.body}</p>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
