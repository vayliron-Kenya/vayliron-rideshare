import Link from "next/link";
import { redirect } from "next/navigation";

import { addVehicleAction } from "@/app/fleet-actions";
import { ActionForm, Field, SelectField } from "@/components/action-form";
import { Card, CardHeader } from "@/components/ui";
import { getOwnerSession } from "@/lib/auth";
import { BODY_TYPE_LABEL } from "@/lib/owners";

export const dynamic = "force-dynamic";

export const metadata = { title: "Add a bus" };

/**
 * Registering a vehicle.
 *
 * Only the facts that decide whether a bus can work a route: what it is, what
 * it is called, and how many people fit. Everything subjective — condition,
 * cleanliness, whether the seats are torn — is settled by the photographs on
 * the next screen, because those are the things an owner would describe
 * generously and a controller has to see.
 */
export default async function AddBusPage() {
  const owner = await getOwnerSession();
  if (!owner) redirect("/");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <Link
          href="/fleet"
          className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-body"
        >
          ← My buses
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-body">Add a bus</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Register the vehicle first. You will photograph it on the next screen, then send it to
          Vayliron for approval.
        </p>
      </header>

      <Card>
        <CardHeader title="The vehicle" subtitle="As it reads on the logbook" />
        <div className="px-5 py-5">
          <ActionForm action={addVehicleAction} submit="Add and continue">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Number plate"
                name="plate"
                placeholder="KDA 123A"
                required
                hint="Kenyan civilian plate, as issued by NTSA"
              />
              <Field
                label="Make and model"
                name="model"
                placeholder="Isuzu NQR 5.2"
                required
              />
              <SelectField
                label="What kind of vehicle"
                name="bodyType"
                defaultValue="minibus"
                options={(
                  ["matatu", "minibus", "bus", "coach"] as const
                ).map((value) => ({ value, label: BODY_TYPE_LABEL[value] }))}
              />
              <Field
                label="How many it carries"
                name="capacity"
                type="number"
                min={7}
                max={90}
                defaultValue={33}
                required
                hint="Seated passengers, not counting the crew"
              />
              <Field
                label="USB charging points"
                name="usbPorts"
                type="number"
                min={0}
                max={90}
                defaultValue={0}
              />
              <label className="flex items-center gap-3 self-end pb-2">
                <input
                  type="checkbox"
                  name="wifi"
                  className="size-5 rounded border-edge accent-[var(--color-brand)]"
                />
                <span className="text-sm text-body">This bus has Wi-Fi</span>
              </label>
            </div>
          </ActionForm>
        </div>
      </Card>

      <p className="text-xs leading-relaxed text-faint">
        A bus carries nobody until Vayliron approves it. Adding it here costs nothing and does not
        commit you to a route.
      </p>
    </div>
  );
}
