import { AuditList } from "@/components/audit-list";
import { CompanyTabs } from "@/components/company-tabs";
import { Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { listAudit } from "@/lib/audit";
import { getCompanyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Activity" };

export default async function CompanyActivityPage() {
  const session = await getCompanyAdmin();
  if (!session) {
    return (
      <EmptyState
        title="Admins only"
        body="The activity log is visible to the HR and finance admins on your Vayliron account."
      />
    );
  }

  const events = listAudit({ companyId: session.company.id, limit: 100 });
  const byUs = events.filter((e) => e.actorKind === "employee").length;
  const byVayliron = events.length - byUs;
  const cancellations = events.filter((e) => e.action === "trip.cancel").length;

  return (
    <div className="space-y-6">
      <CompanyTabs active="activity" />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-body">Activity</h1>
        <p className="mt-1 text-sm text-muted">
          Every change to the {session.company.name} account — by your own admins, and by Vayliron
          on your behalf
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Changes by your team" value={byUs} tone="brand" />
        <Stat label="Changes by Vayliron" value={byVayliron} />
        <Stat
          label="Departures cancelled"
          value={cancellations}
          tone={cancellations > 0 ? "flame" : "neutral"}
          hint="Runs your staff had seats on"
        />
      </section>

      <Card>
        <CardHeader title="Log" subtitle="Newest first, last 100 entries" />
        <AuditList
          events={events}
          emptyTitle="Nothing yet"
          emptyBody="Adding staff, changing the subsidy policy, or a departure Vayliron cancels will show up here."
        />
      </Card>

      <Card className="px-5 py-4">
        <p className="text-xs leading-relaxed text-faint">
          This log covers administrative changes. Individual bookings, boardings and no-shows are
          not repeated here — they are on the invoice and in each rider&apos;s own trip history.
        </p>
      </Card>
    </div>
  );
}
