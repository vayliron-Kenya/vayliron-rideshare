import Link from "next/link";
import { redirect } from "next/navigation";

import { findInviteAction } from "@/app/chama-actions";
import { ActionForm, Field } from "@/components/action-form";
import { RoleBadge, StatusBadge } from "@/components/chama";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { actorFrom, getPrincipal } from "@/lib/auth";
import { listAllChamas, listChamasFor, whoFromActor } from "@/lib/chama";
import { categoryFor, formatMoney } from "@/lib/domain/chama";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chama" };

export default async function ChamaHome() {
  const principal = await getPrincipal();
  if (!principal) redirect("/");

  // Vayliron staff see every group, read-only, for compliance — and cannot
  // join, sign or move anything from here.
  if (principal.kind === "operator") {
    const all = listAllChamas();
    return (
      <div className="space-y-6">
        <header>
          <p className="text-xs uppercase tracking-wider text-faint">Compliance view · read-only</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-body">Chamas on the platform</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Balances are each group&apos;s confirmed ledger. Staff can see them; no staff role can
            sign, confirm or record money for a group.
          </p>
        </header>
        {all.length === 0 ? (
          <EmptyState title="No chamas yet" body="Groups appear here as members create them." />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-faint">
                <tr>
                  <th className="px-5 py-3">Group</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Members</th>
                  <th className="px-5 py-3 text-right">Book balance</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {all.map(({ chama, members, balanceMinor }) => (
                  <tr key={chama.id}>
                    <td className="px-5 py-3 font-medium text-body">{chama.name}</td>
                    <td className="px-5 py-3 text-muted">{categoryFor(chama.category).label}</td>
                    <td className="tabular px-5 py-3 text-muted">{members}</td>
                    <td className="tabular px-5 py-3 text-right text-body">{formatMoney(balanceMinor, chama.currency)}</td>
                    <td className="px-5 py-3"><StatusBadge status={chama.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    );
  }

  const me = whoFromActor(actorFrom(principal));
  const mine = listChamasFor(me.key);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-faint">Savings groups</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-body">Your chamas</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            The group&apos;s book, kept where every member can read it. Money moves on M-Pesa, a
            bank or at the meeting; it counts here once a second officer has confirmed it.
          </p>
        </div>
        <Link
          href="/chama/new"
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-hover"
        >
          Start a chama
        </Link>
      </header>

      {mine.length === 0 ? (
        <EmptyState
          title="You're not in a chama yet"
          body="Start one and invite people with its code, or enter a code someone has given you."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {mine.map(({ chama, role, members, balanceMinor }) => (
            <Link key={chama.id} href={`/chama/${chama.id}`} className="block">
              <Card className="h-full p-5 transition-colors hover:border-brand/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-body">{chama.name}</p>
                    <p className="text-xs text-faint">{categoryFor(chama.category).label} · {members} members</p>
                  </div>
                  <RoleBadge role={role} />
                </div>
                <p className="tabular mt-4 text-xl font-semibold text-body">{formatMoney(balanceMinor, chama.currency)}</p>
                <p className="text-xs text-muted">confirmed on the group&apos;s books</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader title="Join with an invitation code" subtitle="You'll read the group's constitution before you join." />
        <div className="p-5">
          <ActionForm action={findInviteAction} submit="Find chama" className="max-w-sm">
            <Field label="Invitation code" name="code" placeholder="e.g. K7QM2XPA" required />
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
