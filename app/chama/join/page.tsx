import { redirect } from "next/navigation";

import { joinChamaAction } from "@/app/chama-actions";
import { ActionForm, CheckField } from "@/components/action-form";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { getPrincipal } from "@/lib/auth";
import { constitutionHistory, getChamaByInvite, listMembers } from "@/lib/chama";
import { categoryFor, formatMoney } from "@/lib/domain/chama";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join a chama" };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  if (!(await getPrincipal())) redirect("/");
  const { code = "" } = await searchParams;
  const chama = getChamaByInvite(code);
  if (!chama || chama.status === "dissolved") {
    return <EmptyState title="No open chama with that code" body="Check the code with whoever invited you." />;
  }
  const constitution = constitutionHistory(chama.id)[0];
  const members = listMembers(chama.id).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-faint">{categoryFor(chama.category).label}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-body">{chama.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {members} of {chama.maxMembers} members · {formatMoney(chama.contributionMinor, chama.currency)} {chama.frequency}
          {chama.entryFeeMinor > 0 ? ` · ${formatMoney(chama.entryFeeMinor, chama.currency)} to join` : ""}
        </p>
        {chama.description ? <p className="mt-3 text-sm text-body">{chama.description}</p> : null}
      </header>

      <Card>
        <CardHeader title={`Constitution · version ${constitution.version}`} subtitle="These are the rules you agree to by joining." />
        <div className="whitespace-pre-line px-5 py-4 text-sm leading-relaxed text-body">{constitution.body}</div>
      </Card>

      <ActionForm action={joinChamaAction} submit="Join this chama">
        <input type="hidden" name="code" value={chama.inviteCode} />
        <input type="hidden" name="version" value={constitution.version} />
        <CheckField name="accept" label={`I have read and accept version ${constitution.version} of this constitution.`} />
      </ActionForm>
    </div>
  );
}
