import Link from "next/link";
import { redirect } from "next/navigation";

import { AuditList } from "@/components/audit-list";
import { Card, CardHeader, Stat } from "@/components/ui";
import { auditNamespaces, listAudit, type ActorKind } from "@/lib/audit";
import { getOperatorSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Audit trail" };

const PAGE_SIZE = 50;

const ACTORS: { value: string; label: string }[] = [
  { value: "", label: "Everyone" },
  { value: "operator", label: "Control" },
  { value: "driver", label: "Drivers" },
  { value: "employee", label: "Clients" },
  { value: "system", label: "System" },
];

const NAMESPACE_LABEL: Record<string, string> = {
  "trip.": "Departures",
  "incident.": "Incidents",
  "employee.": "Staff",
  "company.": "Contracts",
  "driver.": "Roster",
  "vehicle.": "Fleet",
  "route.": "Lines",
  "stop.": "Stages",
};

interface PageProps {
  searchParams: Promise<{ actor?: string; ns?: string; page?: string }>;
}

export default async function OpsAuditPage({ searchParams }: PageProps) {
  const operator = await getOperatorSession();
  if (!operator) redirect("/");

  const query = await searchParams;
  const actorKind = ACTORS.some((a) => a.value && a.value === query.actor)
    ? (query.actor as ActorKind)
    : undefined;
  const namespaces = auditNamespaces();
  const ns = namespaces.includes(query.ns ?? "") ? query.ns : undefined;
  const page = Math.max(1, Number(query.page ?? 1) || 1);

  const events = listAudit({
    actorKind,
    action: ns,
    limit: PAGE_SIZE + 1,
    offset: (page - 1) * PAGE_SIZE,
  });
  const hasMore = events.length > PAGE_SIZE;
  const visible = events.slice(0, PAGE_SIZE);

  // Cheap headline counts over a recent window, not the whole table.
  const recent = listAudit({ limit: 500 });
  const byControl = recent.filter((e) => e.actorKind === "operator").length;
  const cancellations = recent.filter((e) => e.action === "trip.cancel" && !e.companyId).length;

  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { actor: query.actor ?? "", ns: ns ?? "", page: "", ...patch };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    return `/ops/audit${next.size ? `?${next}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-body">Audit trail</h1>
        <p className="mt-1 text-sm text-muted">
          Who changed what. Administrative actions only — boardings and rider bookings are their
          own records and would bury this one.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Recent entries" value={recent.length} hint="Last 500 shown" />
        <Stat label="By control" value={byControl} tone="brand" />
        <Stat
          label="Cancellations"
          value={cancellations}
          tone={cancellations > 0 ? "flame" : "neutral"}
        />
      </section>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {ACTORS.map((option) => (
            <Link
              key={option.value || "all"}
              href={href({ actor: option.value })}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                (query.actor ?? "") === option.value
                  ? "border-brand/60 bg-brand-soft text-accent"
                  : "border-edge text-muted hover:text-body"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>

        {namespaces.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            <Link
              href={href({ ns: "" })}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                !ns
                  ? "border-brand/60 bg-brand-soft text-accent"
                  : "border-edge text-muted hover:text-body"
              }`}
            >
              Everything
            </Link>
            {namespaces.map((namespace) => (
              <Link
                key={namespace}
                href={href({ ns: namespace })}
                className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  ns === namespace
                    ? "border-brand/60 bg-brand-soft text-accent"
                    : "border-edge text-muted hover:text-body"
                }`}
              >
                {NAMESPACE_LABEL[namespace] ?? namespace.replace(".", "")}
              </Link>
            ))}
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Entries"
          subtitle={`Newest first · page ${page}`}
          action={
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={href({ page: String(page - 1) })}
                  className="rounded-lg border border-edge px-2.5 py-1 text-xs text-muted transition-colors hover:text-body"
                >
                  Newer
                </Link>
              ) : null}
              {hasMore ? (
                <Link
                  href={href({ page: String(page + 1) })}
                  className="rounded-lg border border-edge px-2.5 py-1 text-xs text-muted transition-colors hover:text-body"
                >
                  Older
                </Link>
              ) : null}
            </div>
          }
        />
        <AuditList
          events={visible}
          linkTrips
          emptyTitle="Nothing matches"
          emptyBody="No administrative changes fit those filters yet."
        />
      </Card>
    </div>
  );
}
