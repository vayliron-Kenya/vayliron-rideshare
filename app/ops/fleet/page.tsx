import { redirect } from "next/navigation";

import { createDriverAction, createVehicleAction, setDriverActiveAction } from "@/app/ops-actions";
import { ActionForm, CheckField, Field } from "@/components/action-form";
import { Badge, Card, CardHeader, Meter, Stat } from "@/components/ui";
import { getNetworkAdmin, getOperatorSession } from "@/lib/auth";
import { nextServiceDate } from "@/lib/domain/schedule";
import { formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { listDrivers, listFleet } from "@/lib/ops";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fleet" };

export default async function OpsFleetPage() {
  const operator = await getOperatorSession();
  if (!operator) redirect("/");
  const canEdit = Boolean(await getNetworkAdmin());

  const serviceDate = nextServiceDate(nairobiDate());
  const fleet = listFleet(serviceDate);
  const drivers = listDrivers(serviceDate);

  const seats = fleet.reduce((sum, v) => sum + v.capacity, 0);
  const inService = fleet.filter((v) => v.runsToday > 0).length;
  const activeDrivers = drivers.filter((d) => d.active === 1).length;
  const rostered = drivers.filter((d) => d.runsToday > 0).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-body">Fleet &amp; roster</h1>
        <p className="mt-1 text-sm text-muted">
          Utilisation shown for {formatServiceDate(serviceDate)}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Buses" value={fleet.length} hint={`${seats.toLocaleString("en-KE")} seats in total`} />
        <Stat
          label="In service today"
          value={`${inService} / ${fleet.length}`}
          tone={inService === fleet.length ? "brand" : "amber"}
          hint={`${fleet.length - inService} idle`}
        />
        <Stat label="Drivers" value={activeDrivers} hint={`${drivers.length - activeDrivers} stood down`} />
        <Stat
          label="Rostered today"
          value={`${rostered} / ${activeDrivers}`}
          hint="Drivers with at least one run"
        />
      </section>

      {canEdit ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-body">Add a bus</h2>
            <ActionForm
              action={createVehicleAction}
              submit="Add to fleet"
              resetOnSuccess
              className="mt-4 space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Plate" name="plate" placeholder="KDG 411R" required />
                <Field label="Model" name="model" placeholder="Isuzu NQR 5.2" required />
                <Field label="Seats" name="capacity" type="number" min={8} max={90} defaultValue={33} required />
                <Field label="Operator" name="operator" defaultValue="Vayliron Fleet" required />
              </div>
              <CheckField label="Wi-Fi and USB on board" name="wifi" defaultChecked />
            </ActionForm>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-body">Add a driver</h2>
            <ActionForm
              action={createDriverAction}
              submit="Add to roster"
              resetOnSuccess
              className="mt-4 space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" name="name" placeholder="Peter Mwangi" required />
                <Field label="Phone" name="phone" placeholder="+254712345678" required />
                <Field label="PSV badge" name="psvLicence" placeholder="PSV-884120" required />
                <Field
                  label="Sign-in email"
                  name="email"
                  type="email"
                  placeholder="peter.mwangi@vayliron.co.ke"
                  required
                  hint="This is how they sign in to the driver app."
                />
              </div>
            </ActionForm>
          </Card>
        </div>
      ) : (
        <Card className="px-5 py-4">
          <p className="text-sm text-muted">
            You are signed in as a controller. Adding or standing down buses and drivers needs
            network admin rights.
          </p>
        </Card>
      )}

      <Card>
        <CardHeader title="Buses" subtitle="Sorted by plate" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
                <th className="px-5 py-3 font-medium">Plate</th>
                <th className="px-5 py-3 font-medium">Model</th>
                <th className="px-5 py-3 text-right font-medium">Seats</th>
                <th className="px-5 py-3 text-right font-medium">Runs today</th>
                <th className="px-5 py-3 font-medium">Load</th>
                <th className="px-5 py-3 font-medium">Operator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {fleet.map((vehicle) => (
                <tr key={vehicle.id} className="text-muted">
                  <td className="tabular whitespace-nowrap px-5 py-3 font-medium text-body">
                    {vehicle.plate}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    {vehicle.model}
                    {vehicle.wifi ? (
                      <Badge tone="sky" className="ml-2">
                        Wi-Fi
                      </Badge>
                    ) : null}
                  </td>
                  <td className="tabular px-5 py-3 text-right">{vehicle.capacity}</td>
                  <td className="tabular px-5 py-3 text-right">{vehicle.runsToday}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Meter
                        pct={vehicle.loadPct}
                        tone={vehicle.loadPct >= 85 ? "flame" : "brand"}
                        className="w-24"
                      />
                      <span className="tabular text-xs">{vehicle.loadPct}%</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs">{vehicle.operator}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Drivers" subtitle="Busiest first" />
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
                <th className="px-5 py-3 font-medium">Driver</th>
                <th className="px-5 py-3 font-medium">PSV badge</th>
                <th className="px-5 py-3 font-medium">Sign-in</th>
                <th className="px-5 py-3 text-right font-medium">Runs today</th>
                <th className="px-5 py-3 text-right font-medium">Riders</th>
                <th className="px-5 py-3 font-medium">Rating</th>
                {canEdit ? <th className="px-5 py-3 font-medium">Status</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {drivers.map((driver) => (
                <tr key={driver.id} className={driver.active ? "text-muted" : "text-faint"}>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span className={driver.active ? "text-body" : ""}>{driver.name}</span>
                    <span className="ml-2 text-xs text-faint">{driver.phone}</span>
                  </td>
                  <td className="tabular whitespace-nowrap px-5 py-3 text-xs">
                    {driver.psvLicence}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs">
                    {driver.email ?? <span className="text-flame">no login</span>}
                  </td>
                  <td className="tabular px-5 py-3 text-right">{driver.runsToday}</td>
                  <td className="tabular px-5 py-3 text-right">{driver.seatsSoldToday}</td>
                  <td className="tabular px-5 py-3">{(driver.ratingBps / 1000).toFixed(1)}★</td>
                  {canEdit ? (
                    <td className="px-5 py-3">
                      <form action={setDriverActiveAction}>
                        <input type="hidden" name="driverId" value={driver.id} />
                        <input type="hidden" name="active" value={driver.active ? "0" : "1"} />
                        <button
                          type="submit"
                          className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                            driver.active
                              ? "border-edge text-muted hover:border-flame/60 hover:text-flame"
                              : "border-brand/50 text-brand-bright hover:bg-brand-soft"
                          }`}
                        >
                          {driver.active ? "Stand down" : "Reinstate"}
                        </button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
