import Link from "next/link";
import { redirect } from "next/navigation";

import { AlertIcon, BusIcon, CheckIcon, ClockIcon } from "@/components/icons";
import { Badge, Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { getOwnerSession } from "@/lib/auth";
import { formatKes } from "@/lib/domain/fares";
import { formatServiceDate, nairobiDate } from "@/lib/domain/time";
import {
  BODY_TYPE_LABEL,
  ownedVehicles,
  REQUIRED_ANGLES,
  VEHICLE_STATUS_LABEL,
  type OwnedVehicle,
} from "@/lib/owners";
import type { VehicleStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "My buses" };

const STATUS_TONE: Record<VehicleStatus, "neutral" | "brand" | "amber" | "flame" | "sky"> = {
  draft: "neutral",
  pending: "amber",
  approved: "brand",
  rejected: "flame",
  suspended: "flame",
};

/**
 * The bus owner's control panel.
 *
 * An owner's question is short and always the same: are my buses earning, and
 * if one is not, what is stopping it? So the page leads with the money and
 * then lists every unit with the single thing that is true about it right now
 * — carrying riders, waiting on Vayliron, or needing something from the owner.
 */
export default async function FleetPage() {
  const owner = await getOwnerSession();
  if (!owner) redirect("/");

  const today = nairobiDate();
  const monthStart = `${today.slice(0, 7)}-01`;
  const buses = ownedVehicles(owner.id, monthStart);

  const approved = buses.filter((b) => b.status === "approved");
  const earned = buses.reduce((sum, b) => sum + b.earnedKes, 0);
  const riders = buses.reduce((sum, b) => sum + b.ridersCarried, 0);
  const needsYou = buses.filter((b) => b.status === "draft" || b.status === "rejected");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-faint">{owner.name}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-body">My buses</h1>
          <p className="mt-1 text-sm text-muted">
            {formatServiceDate(monthStart)} to today · you keep {owner.payoutBps / 100}% of every
            fare
          </p>
        </div>
        <Link
          href="/fleet/add"
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover"
        >
          Add a bus
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Your share this month"
          value={formatKes(earned)}
          hint={`${riders.toLocaleString("en-KE")} riders carried`}
        />
        <Stat
          label="Buses carrying riders"
          value={`${approved.length} / ${buses.length}`}
          hint={approved.length === buses.length ? "All approved" : "See below"}
        />
        <Stat
          label="Waiting on you"
          value={needsYou.length}
          hint={needsYou.length === 0 ? "Nothing outstanding" : "Photographs or a resubmission"}
        />
      </div>

      {buses.length === 0 ? (
        <EmptyState
          title="No buses yet"
          body="Add your first bus, photograph it, and send it to Vayliron. Once they approve it, it can start taking riders."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {buses.map((bus) => (
            <BusCard key={bus.id} bus={bus} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader
          title="How a bus gets on the network"
          subtitle="Vayliron runs the network; you own the vehicle"
        />
        <ol className="space-y-3 px-5 py-4 text-sm text-muted">
          <Step n={1}>Add the bus — plate, make, what kind it is and how many it carries.</Step>
          <Step n={2}>
            Photograph it four ways: outside, inside down the aisle, the plate, and the logbook or
            PSV licence.
          </Step>
          <Step n={3}>
            Send it to Vayliron. A controller looks at the photographs and either approves it or
            tells you what to fix.
          </Step>
          <Step n={4}>
            Once approved it can be rostered onto departures, and every fare it carries is split{" "}
            {owner.payoutBps / 100}% to you.
          </Step>
        </ol>
      </Card>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-accent">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

function BusCard({ bus }: { bus: OwnedVehicle }) {
  const photosDone = new Set(bus.photos.map((p) => p.angle)).size;
  const missing = REQUIRED_ANGLES.length - photosDone;

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="tabular text-lg font-semibold tracking-tight text-body">{bus.plate}</p>
          <p className="truncate text-xs text-faint">
            {bus.model} · {BODY_TYPE_LABEL[bus.bodyType]}
          </p>
        </div>
        <Badge tone={STATUS_TONE[bus.status]}>{VEHICLE_STATUS_LABEL[bus.status]}</Badge>
      </div>

      <div className="flex-1 space-y-3 px-5 py-4">
        {bus.status === "approved" ? (
          <dl className="grid grid-cols-3 gap-3">
            <Cell label="Runs" value={String(bus.runs)} />
            <Cell label="Riders" value={bus.ridersCarried.toLocaleString("en-KE")} />
            <Cell label="Your share" value={formatKes(bus.earnedKes)} />
          </dl>
        ) : null}

        {bus.status === "draft" ? (
          <p className="flex items-start gap-2 text-sm text-muted">
            <ClockIcon className="mt-0.5 size-4 shrink-0 text-faint" />
            {missing > 0
              ? `${missing} more ${missing === 1 ? "photograph" : "photographs"} and this can go to Vayliron.`
              : "Ready to send to Vayliron."}
          </p>
        ) : null}

        {bus.status === "pending" ? (
          <p className="flex items-start gap-2 text-sm text-amber">
            <ClockIcon className="mt-0.5 size-4 shrink-0" />
            With Vayliron since {formatServiceDate((bus.submittedAt ?? "").slice(0, 10))}. They
            usually come back within a working day.
          </p>
        ) : null}

        {bus.status === "rejected" && bus.reviewNote ? (
          <p className="flex items-start gap-2 rounded-xl bg-flame-soft px-3 py-2.5 text-sm leading-relaxed text-flame">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            {bus.reviewNote}
          </p>
        ) : null}

        {bus.status === "suspended" && bus.reviewNote ? (
          <p className="flex items-start gap-2 rounded-xl bg-flame-soft px-3 py-2.5 text-sm leading-relaxed text-flame">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            Pulled off the network — {bus.reviewNote}. Contact Vayliron to put it back.
          </p>
        ) : null}

        {bus.status === "approved" ? (
          <p className="flex items-center gap-2 text-sm text-accent">
            <CheckIcon className="size-4 shrink-0" />
            Approved by {bus.reviewedBy ?? "Vayliron"} · carrying riders
          </p>
        ) : null}
      </div>

      <div className="border-t border-line px-5 py-3">
        <Link
          href={`/fleet/${bus.id}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-accent transition-colors hover:text-brand-hover"
        >
          <BusIcon className="size-4" />
          {bus.status === "draft" || bus.status === "rejected"
            ? "Photograph and submit"
            : "Open this bus"}
        </Link>
      </div>
    </Card>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-faint">{label}</dt>
      <dd className="tabular mt-0.5 text-sm font-semibold text-body">{value}</dd>
    </div>
  );
}
