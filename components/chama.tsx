import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui";
import { ROLE_LABEL, type ChamaRole } from "@/lib/domain/chama";

/** Sub-navigation inside one chama. The books tab only appears for officers. */
export function ChamaTabs({ chamaId, active, books }: { chamaId: string; active: "me" | "books"; books: boolean }) {
  const tabs = [
    { key: "me", href: `/chama/${chamaId}`, label: "My position" },
    ...(books ? [{ key: "books", href: `/chama/${chamaId}/books`, label: "Group books" }] : []),
  ];
  return (
    <nav className="flex w-fit rounded-xl border border-edge p-1">
      <Link href="/chama" className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-body">
        ← All
      </Link>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
            tab.key === active ? "bg-raised font-medium text-body" : "text-muted hover:text-body"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function RoleBadge({ role }: { role: ChamaRole }) {
  const tone = role === "member" ? "neutral" : role === "auditor" ? "sky" : "brand";
  return <Badge tone={tone}>{ROLE_LABEL[role]}</Badge>;
}

const STATUS: Record<string, { label: string; tone: "neutral" | "brand" | "amber" | "flame" | "sky" }> = {
  pending: { label: "Waiting", tone: "amber" },
  approved: { label: "Approved — to send", tone: "sky" },
  executed: { label: "Sent", tone: "brand" },
  confirmed: { label: "Confirmed", tone: "brand" },
  rejected: { label: "Refused", tone: "flame" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  open: { label: "Open", tone: "amber" },
  carried: { label: "Carried", tone: "brand" },
  defeated: { label: "Defeated", tone: "flame" },
  no_quorum: { label: "No quorum", tone: "neutral" },
  forming: { label: "Forming", tone: "amber" },
  active: { label: "Active", tone: "brand" },
  dissolving: { label: "Dissolving", tone: "amber" },
  dissolved: { label: "Dissolved", tone: "neutral" },
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/** A figure labelled for what it is: money on the books, or a projection. */
export function Figure({
  label,
  value,
  hint,
  projected,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  projected?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        projected ? "border-dashed border-edge bg-transparent" : "border-line bg-surface/80"
      }`}
    >
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-faint">
        {label}
        {projected ? <span className="rounded bg-raised px-1 py-px text-[10px] normal-case tracking-normal">projected</span> : null}
      </p>
      <p className="tabular mt-2 text-xl font-semibold text-body">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function when(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso.length === 10 ? `${iso}T12:00:00+03:00` : iso));
}

export const KIND_LABEL: Record<string, string> = {
  contribution: "Contribution",
  entry_fee: "Registration fee",
  late_fee: "Late fee",
  loan_repayment: "Loan repayment",
  payout: "Round payout",
  loan_disbursement: "Loan",
  loan: "Loan",
  withdrawal: "Withdrawal",
  welfare: "Welfare support",
  exit: "Leaving refund",
  exit_refund: "Leaving refund",
  distribution: "Final distribution",
};
