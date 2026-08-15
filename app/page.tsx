import Link from "next/link";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/sign-in-form";
import { Badge, Card } from "@/components/ui";
import { getPrincipal, homePath } from "@/lib/auth";
import { EMPLOYEES, OPERATORS } from "@/lib/data/nairobi";
import { FARE_BANDS, formatKes } from "@/lib/domain/fares";
import { nextServiceDate, SATURDAY_TIMETABLE, TIMETABLE } from "@/lib/domain/schedule";
import { formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { listDriverLogins } from "@/lib/ops";
import { listRoutes, listStops } from "@/lib/queries";

export default async function LandingPage() {
  const principal = await getPrincipal();
  if (principal) redirect(homePath(principal));

  const routes = listRoutes();
  const stops = listStops();
  const today = nairobiDate();
  const serviceDate = nextServiceDate(today);

  const admins = EMPLOYEES.filter((e) => e.role === "admin");
  const drivers = listDriverLogins(2);
  const suggestions = [
    ...OPERATORS.map((o) => o.email),
    ...EMPLOYEES.map((e) => e.email),
    ...drivers.map((d) => d.email),
  ];

  return (
    <div className="space-y-14 pt-6">
      <section className="grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <Badge tone="brand">Nairobi · Mon–Sat scheduled service</Badge>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-accent">
            Vayliron Shared Transportation
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-body sm:text-5xl">
            Your staff, on a bus that shows up.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
            Vayliron Shared Transportation runs {routes.length} scheduled corporate lines across{" "}
            {stops.length} stages —
            Thika Road, Mombasa Road, Waiyaki Way, Ngong Road, Limuru Road, Jogoo Road,
            Lang&apos;ata and the airport. Staff reserve a numbered seat, watch the bus approach
            their stage, and board with a six-character pass. Finance gets the bill, split
            automatically between the employer and the rider.
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Lines", value: String(routes.length) },
              { label: "Stages", value: String(stops.length) },
              { label: "Weekday departures", value: String(routes.length * TIMETABLE.inbound.length * 2) },
              { label: "Saturday departures", value: String(routes.length * SATURDAY_TIMETABLE.inbound.length * 2) },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-xs uppercase tracking-wider text-faint">{item.label}</dt>
                <dd className="tabular mt-1 text-2xl font-semibold text-accent">{item.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 flex flex-wrap gap-2">
            {routes.map((route) => (
              <Link
                key={route.id}
                href={`/routes/${route.slug}`}
                className="rounded-full border border-edge px-3 py-1.5 text-xs text-muted transition-colors hover:border-brand/60 hover:text-accent"
              >
                <span className="tabular font-medium text-body">{route.code}</span> {route.name}
              </Link>
            ))}
          </div>
        </div>

        <Card className="p-6">
          <h2 className="text-sm font-semibold text-body">Sign in</h2>
          <p className="mt-1 text-xs text-faint">
            Next service day: {formatServiceDate(serviceDate)}
            {serviceDate !== today ? " · no service today" : ""}
          </p>

          <div className="mt-5">
            <SignInForm suggestions={suggestions} />
          </div>

          <p className="mt-3 text-xs leading-relaxed text-faint">
            One email, four apps. Where you land depends on who you are — a controller sees the
            network, a driver sees their runs, an HR admin sees their company, a commuter sees
            their seat.
          </p>

          <div className="mt-6 border-t border-line pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-faint">Demo accounts</p>
            <dl className="mt-3 space-y-3">
              <AccountGroup
                title="Vayliron control"
                rows={OPERATORS.map((o) => ({
                  email: o.email,
                  note: o.role === "superadmin" ? "network admin" : "controller",
                }))}
              />
              <AccountGroup
                title="Client control panel"
                rows={admins.map((a) => ({ email: a.email, note: "HR admin" }))}
              />
              <AccountGroup
                title="Driver app"
                rows={drivers.map((d) => ({ email: d.email, note: d.name }))}
              />
              <AccountGroup
                title="Rider app"
                rows={[{ email: EMPLOYEES[1].email, note: EMPLOYEES[1].name }]}
              />
            </dl>
            <p className="mt-4 text-[11px] leading-relaxed text-faint">
              This demo signs you in on the email alone — no password, no SSO. Swap
              <span className="font-mono"> lib/auth.ts </span> for your identity provider before
              real staff data goes anywhere near it.
            </p>
          </div>
        </Card>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-body">Four apps, one network</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: "Rider",
              body: "Reserve a numbered seat on your own commute, watch the bus approach your stage, and board with a six-character pass.",
            },
            {
              title: "Driver",
              body: "Your runs for the day, the manifest by stage, pass-code check-in, and one tap to report the traffic that is holding you up.",
            },
            {
              title: "Client control panel",
              body: "HR manages staff and the subsidy policy; finance pulls the monthly invoice with a payroll deduction line per rider.",
            },
            {
              title: "Vayliron control",
              body: "The live network board — load, revenue, delays and incidents — with the power to reassign, delay or cancel any departure.",
            },
          ].map((item) => (
            <Card key={item.title} className="p-5">
              <h3 className="text-sm font-semibold text-body">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-body">Fares</h2>
        <p className="mt-1 text-sm text-muted">
          Priced on the distance actually travelled on the line, not on the whole route.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {FARE_BANDS.map((band) => (
            <Card key={band.label} className="p-4">
              <p className="text-xs text-faint">{band.label}</p>
              <p className="tabular mt-1.5 text-xl font-semibold text-body">
                {formatKes(band.fareKes)}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function AccountGroup({
  title,
  rows,
}: {
  title: string;
  rows: { email: string; note: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-faint">{title}</dt>
      {rows.map((row) => (
        <dd key={row.email} className="mt-1 text-xs">
          <span className="font-mono text-accent">{row.email}</span>
          <span className="text-faint"> — {row.note}</span>
        </dd>
      ))}
    </div>
  );
}
