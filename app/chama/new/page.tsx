import { redirect } from "next/navigation";

import { createChamaAction } from "@/app/chama-actions";
import { ActionForm, Field, SelectField, TextAreaField } from "@/components/action-form";
import { Card, CardHeader } from "@/components/ui";
import { getPrincipal } from "@/lib/auth";
import { CHAMA_CATEGORIES, CHAMA_CURRENCIES, dueDate } from "@/lib/domain/chama";
import { nairobiDate } from "@/lib/domain/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Start a chama" };

export default async function NewChamaPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/");
  if (principal.kind === "operator") redirect("/chama");

  const today = nairobiDate();
  const firstOfNextMonth = dueDate(`${today.slice(0, 7)}-01`, "monthly", 1);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-faint">New savings group</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-body">Start a chama</h1>
        <p className="mt-1 text-sm text-muted">
          You become chairperson. A constitution is drafted from these rules; members read and
          accept it to join, and change it only by vote.
        </p>
      </header>

      <ActionForm action={createChamaAction} submit="Create chama" className="space-y-6">
        <Card>
          <CardHeader title="The group" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Name" name="name" required placeholder="Upper Hill Wednesday Group" />
            <SelectField
              label="Type"
              name="category"
              defaultValue="asca"
              options={CHAMA_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
            />
            <div className="sm:col-span-2">
              <TextAreaField label="What it's for" name="description" rows={2} placeholder="Optional" />
            </div>
            <Field label="Country" name="country" defaultValue="KE" hint="Two-letter code. Kenya first." />
            <SelectField
              label="Currency"
              name="currency"
              defaultValue="KES"
              options={CHAMA_CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
            <SelectField
              label="Who can find it"
              name="visibility"
              defaultValue="private"
              options={[
                { value: "private", label: "Invitation only" },
                { value: "public", label: "Listed, still joins by invitation" },
              ]}
            />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Min members" name="minMembers" type="number" defaultValue={5} min={2} max={500} />
              <Field label="Max members" name="maxMembers" type="number" defaultValue={20} min={2} max={500} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Contributions" />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Amount each" name="contribution" required placeholder="2,000" />
            <SelectField
              label="How often"
              name="frequency"
              defaultValue="monthly"
              options={[
                { value: "weekly", label: "Weekly" },
                { value: "fortnightly", label: "Every two weeks" },
                { value: "monthly", label: "Monthly" },
              ]}
            />
            <Field label="First due" name="anchorDate" type="date" defaultValue={firstOfNextMonth} />
            <Field label="Grace days" name="graceDays" type="number" defaultValue={3} min={0} max={30} />
            <Field label="Late fee" name="lateFee" defaultValue="0" hint="Per late contribution" />
            <Field label="Registration fee" name="entryFee" defaultValue="0" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Safeguards and lending" subtitle="No single officer can release money. These settings decide how many must agree." />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Officer signatures to release money" name="approvalsRequired" type="number" defaultValue={2} min={2} max={10} hint="Never the requester or recipient." />
            <Field label="Emergency reserve %" name="reservePct" type="number" defaultValue={10} min={0} max={100} step="0.5" />
            <Field label="Loan rate % per month (flat)" name="loanRatePct" type="number" defaultValue={1} min={0} max={10} step="0.1" hint="Only used by groups that lend." />
            <Field label="Borrow up to × savings" name="loanMultiple" type="number" defaultValue={3} min={0} max={10} step="0.5" />
          </div>
        </Card>
      </ActionForm>
    </div>
  );
}
