import Link from "next/link";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/sign-in-form";
import { Badge, Card } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { EMPLOYEES } from "@/lib/data/nairobi";
import { FARE_BANDS, formatKes } from "@/lib/domain/fares";
import { nextServiceDate, SATURDAY_TIMETABLE, TIMETABLE } from "@/lib/domain/schedule";
import { formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { listRoutes, listStops } from "@/lib/queries";

export default async function LandingPage() {
  if (await getSession()) redirect("/dashboard");

  const routes = listRoutes();
  const stops = listStops();
  const today = nairobiDate();
  const serviceDate = nextServiceDate(today);

  const suggestions = EMPLOYEES.map((e) => e.email);
  const admins = EMPLOYEES.filter((e) => e.role === "admin");

  return (
    <div className="space-y-14 pt-6">
      <section className="grid items-start gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <Badge tone="brand">Nairobi · Mon–Sat scheduled service</Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-body sm:text-5xl">
            Your staff, on a bus that shows up.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
            Vayliron runs {routes.length} scheduled corporate lines across {stops.length} stages —
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
                <dd className="tabular mt-1 text-2xl font-semibold text-brand-bright">{item.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 flex flex-wrap gap-2">
            {routes.map((route) => (
              <Link
                key={route.id}
                href={`/routes/${route.slug}`}
                className="rounded-full border border-edge px-3 py-1.5 text-xs text-muted transition-colors hover:border-brand/60 hover:text-brand-bright"
              >
                <span className="tabular font-medium text-body">{route.code}</span> {route.name}
              </Link>
            ))}
          </div>
        </div>

        <Card className="p-6">
          <h2 className="text-sm font-semibold text-body">Staff sign in</h2>
          <p className="mt-1 text-xs text-faint">
            Next service day: {formatServiceDate(serviceDate)}
            {serviceDate !== today ? " · no service today" : ""}
          </p>

          <div className="mt-5">
            <SignInForm suggestions={suggestions} />
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-faint">Demo accounts</p>
            <ul className="mt-2 space-y-1.5">
              {admins.map((admin) => (
                <li key={admin.email} className="text-xs">
                  <span className="font-mono text-brand-bright">{admin.email}</span>
                  <span className="text-faint"> — HR admin</span>
                </li>
              ))}
              <li className="text-xs">
                <span className="font-mono text-brand-bright">{EMPLOYEES[1].email}</span>
                <span className="text-faint"> — rider</span>
              </li>
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-faint">
              This demo signs you in on the work email alone — no password, no SSO. Swap
              <span className="font-mono"> lib/auth.ts </span> for your identity provider before
              real staff data goes anywhere near it.
            </p>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Reserve a numbered seat",
            body: "Pick your stage and your departure. Seats are held per person per departure, so nobody stands and nobody doubles up.",
          },
          {
            title: "Watch it approach",
            body: "Every running bus reports its position against the timetable, with a live ETA for your stage and a peak-traffic factor baked in.",
          },
          {
            title: "Bill it correctly",
            body: "Each leg is priced on a distance band, then split between employer and employee to the shilling — including monthly per-staff caps.",
          },
        ].map((item) => (
          <Card key={item.title} className="p-5">
            <h3 className="text-sm font-semibold text-body">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
          </Card>
        ))}
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
