import { redirect } from "next/navigation";

import { approveVehicleAction, rejectVehicleAction } from "@/app/ops-actions";
import { ActionForm, TextAreaField } from "@/components/action-form";
import { Badge, Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { getOperatorSession } from "@/lib/auth";
import { formatServiceDate } from "@/lib/domain/time";
import {
  ANGLE_LABEL,
  BODY_TYPE_LABEL,
  pendingVehicles,
  type PendingVehicle,
} from "@/lib/owners";

export const dynamic = "force-dynamic";

export const metadata = { title: "Approvals" };

const OWNER_KIND_LABEL = {
  individual: "Individual owner",
  sacco: "SACCO",
  company: "Company",
} as const;

/**
 * The approval queue.
 *
 * Vayliron does not own the fleet, so this is the gate: somebody in Kasarani
 * has photographed their matatu and wants it on the network. A controller
 * looks at four pictures and decides. The photographs are therefore the page —
 * large, side by side, above the two buttons — rather than thumbnails in a
 * table row.
 */
export default async function ApprovalsPage() {
  const operator = await getOperatorSession();
  if (!operator) redirect("/");

  const queue = pendingVehicles();
  const oldest = queue[0];
  const seats = queue.reduce((sum, v) => sum + v.capacity, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-body">Buses waiting on us</h1>
        <p className="mt-1 text-sm text-muted">
          Owners submit their own vehicles. Nothing carries a rider until somebody here has looked
          at it.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="In the queue" value={queue.length} />
        <Stat
          label="Seats they would add"
          value={seats.toLocaleString("en-KE")}
          hint="Across every waiting unit"
        />
        <Stat
          label="Longest wait"
          value={oldest ? formatServiceDate((oldest.submittedAt ?? "").slice(0, 10)) : "—"}
          hint={oldest ? oldest.plate : "Queue is clear"}
        />
      </div>

      {queue.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          body="Every bus submitted by an owner has been dealt with. New submissions land here."
        />
      ) : (
        <div className="space-y-5">
          {queue.map((vehicle) => (
            <ReviewCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ vehicle }: { vehicle: PendingVehicle }) {
  const byAngle = new Map(vehicle.photos.map((p) => [p.angle, p.id]));

  // Tagged so a decision can be aimed at one specific bus — by a browser test,
  // and by anyone reading the queue with more than one unit in it.
  return (
    <Card className="scroll-mt-4" data-vehicle-id={vehicle.id} data-plate={vehicle.plate}>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="tabular text-base">{vehicle.plate}</span>
            <Badge tone="amber">Waiting since {formatServiceDate((vehicle.submittedAt ?? "").slice(0, 10))}</Badge>
          </span>
        }
        subtitle={`${vehicle.model} · ${BODY_TYPE_LABEL[vehicle.bodyType]} · carries ${vehicle.capacity}${vehicle.wifi ? " · Wi-Fi" : ""}`}
        action={
          <div className="text-right">
            <p className="text-sm font-medium text-body">{vehicle.ownerName}</p>
            <p className="text-xs text-faint">
              {OWNER_KIND_LABEL[vehicle.ownerKind]} · {vehicle.ownerPhone}
            </p>
          </div>
        }
      />

      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {(["exterior", "interior", "plate", "logbook"] as const).map((angle) => {
          const id = byAngle.get(angle);
          return (
            <figure key={angle} className="space-y-2">
              {id ? (
                // eslint-disable-next-line @next/next/no-img-element -- private
                // route with an auth check, not a static asset.
                <img
                  src={`/api/vehicle-photos/${id}`}
                  alt={ANGLE_LABEL[angle]}
                  className="h-44 w-full rounded-xl border border-line object-cover"
                />
              ) : (
                <div className="flex h-44 w-full items-center justify-center rounded-xl border border-dashed border-edge text-xs text-faint">
                  Missing
                </div>
              )}
              <figcaption className="text-xs text-faint">{ANGLE_LABEL[angle]}</figcaption>
            </figure>
          );
        })}
      </div>

      <div className="grid gap-5 border-t border-line px-5 py-5 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-body">Let it carry riders</p>
          <p className="mt-1 mb-3 text-xs leading-relaxed text-muted">
            {vehicle.plate} becomes rosterable immediately, and {vehicle.ownerName} starts earning
            on it.
          </p>
          <ActionForm action={approveVehicleAction} submit="Approve this bus">
            <input type="hidden" name="vehicleId" value={vehicle.id} />
          </ActionForm>
        </div>

        <div>
          <p className="text-sm font-semibold text-body">Send it back</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            The owner sees exactly what you write here, so tell them what to fix.
          </p>
          <ActionForm action={rejectVehicleAction} submit="Turn it down" tone="flame">
            <input type="hidden" name="vehicleId" value={vehicle.id} />
            <div className="mt-3">
              <TextAreaField
                label="Why"
                name="reason"
                rows={2}
                required
                placeholder="The interior photograph shows torn seat covers on the rear bench."
              />
            </div>
          </ActionForm>
        </div>
      </div>
    </Card>
  );
}
