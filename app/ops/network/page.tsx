import Link from "next/link";
import { redirect } from "next/navigation";

import { createStopAction, setRouteActiveAction } from "@/app/ops-actions";
import { ActionForm, Field } from "@/components/action-form";
import { Badge, Card, CardHeader, Stat } from "@/components/ui";
import { getNetworkAdmin } from "@/lib/auth";
import { listAllRoutes } from "@/lib/ops";
import { listStops } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Network" };

export default async function OpsNetworkPage() {
  const admin = await getNetworkAdmin();
  if (!admin) redirect("/ops");

  const routes = listAllRoutes();
  const stops = listStops();

  const byArea = new Map<string, typeof stops>();
  for (const stop of stops) {
    const list = byArea.get(stop.area) ?? [];
    list.push(stop);
    byArea.set(stop.area, list);
  }

  const activeRoutes = routes.filter((r) => r.active === 1).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-body">Network</h1>
        <p className="mt-1 text-sm text-muted">
          {activeRoutes} of {routes.length} lines running · {stops.length} stages across{" "}
          {byArea.size} areas
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Lines" value={`${activeRoutes} / ${routes.length}`} tone="brand" />
        <Stat label="Stages" value={stops.length} />
        <Stat label="Areas served" value={byArea.size} />
      </section>

      <Card>
        <CardHeader
          title="Lines"
          subtitle="Taking a line out of service hides it from riders — departures already booked are untouched"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
                <th className="px-5 py-3 font-medium">Line</th>
                <th className="px-5 py-3 font-medium">Corridor</th>
                <th className="px-5 py-3 text-right font-medium">Stages</th>
                <th className="px-5 py-3 font-medium">State</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {routes.map((route) => (
                <tr key={route.id} className="text-muted">
                  <td className="whitespace-nowrap px-5 py-3">
                    <Link
                      href={`/routes/${route.slug}`}
                      className="transition-colors hover:text-accent"
                    >
                      <span className="tabular text-accent">{route.code}</span>{" "}
                      <span className="text-body">{route.name}</span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs">{route.corridor}</td>
                  <td className="tabular px-5 py-3 text-right">{route.stops}</td>
                  <td className="px-5 py-3">
                    {route.active ? <Badge tone="brand">Running</Badge> : <Badge tone="flame">Suspended</Badge>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <form action={setRouteActiveAction}>
                      <input type="hidden" name="routeId" value={route.id} />
                      <input type="hidden" name="active" value={route.active ? "0" : "1"} />
                      <button
                        type="submit"
                        className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                          route.active
                            ? "border-edge text-muted hover:border-flame/60 hover:text-flame"
                            : "border-brand/50 text-accent hover:bg-brand-soft"
                        }`}
                      >
                        {route.active ? "Suspend" : "Resume"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-body">Add a stage</h2>
          <p className="mt-1 text-xs leading-relaxed text-faint">
            Coordinates must fall inside greater Nairobi. A new stage is not on any line until it is
            added to one — until then no seats can be sold to it.
          </p>
          <ActionForm
            action={createStopAction}
            submit="Add stage"
            resetOnSuccess
            className="mt-4 space-y-3"
          >
            <Field label="Name" name="name" placeholder="Kahawa West" required />
            <Field label="Area" name="area" placeholder="Thika Road" required />
            <Field label="Landmark" name="landmark" placeholder="Kahawa West Stage" required />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Latitude"
                name="lat"
                type="number"
                step="0.0001"
                placeholder="-1.1900"
                required
              />
              <Field
                label="Longitude"
                name="lng"
                type="number"
                step="0.0001"
                placeholder="36.9200"
                required
              />
            </div>
          </ActionForm>
        </Card>

        <Card>
          <CardHeader title="Stages" subtitle="Grouped by area" />
          <div className="max-h-[36rem] space-y-5 overflow-auto p-5">
            {[...byArea.entries()]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([area, areaStops]) => (
                <div key={area}>
                  <h3 className="text-xs font-medium uppercase tracking-wider text-faint">
                    {area} · {areaStops.length}
                  </h3>
                  <ul className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                    {areaStops.map((stop) => (
                      <li key={stop.id} className="text-sm">
                        <span className="text-body">{stop.name}</span>
                        <span className="ml-2 text-xs text-faint">{stop.landmark}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </Card>
      </div>

      <Card className="px-5 py-4">
        <p className="text-xs leading-relaxed text-faint">
          Reordering a line&apos;s stages and setting the distance between them is not exposed here
          yet — it changes fares on live bookings, so it needs a review step before it can be a
          one-click edit. Lines are defined in{" "}
          <span className="font-mono text-muted">lib/data/nairobi.ts</span> and loaded by the seed.
        </p>
      </Card>
    </div>
  );
}
