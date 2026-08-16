import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { submitVehicleAction } from "@/app/fleet-actions";
import { ActionForm } from "@/components/action-form";
import { AlertIcon, CheckIcon, ClockIcon } from "@/components/icons";
import { PhotoUpload } from "@/components/photo-upload";
import { Badge, Card, CardHeader } from "@/components/ui";
import { getOwnerSession } from "@/lib/auth";
import { formatServiceDate } from "@/lib/domain/time";
import {
  ANGLE_LABEL,
  BODY_TYPE_LABEL,
  getVehicleForOwner,
  REQUIRED_ANGLES,
  VEHICLE_STATUS_LABEL,
  vehiclePhotos,
} from "@/lib/owners";
import type { PhotoAngle, VehicleStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ vehicleId: string }>;
}

const ANGLE_HINT: Record<PhotoAngle, string> = {
  exterior: "Stand back far enough that the whole side of the bus is in frame.",
  interior: "From the door, down the aisle, so the seats and the floor are visible.",
  plate: "Close enough that every character can be read without guessing.",
  logbook: "The page with the plate and the owner's name, or the PSV licence.",
};

const STATUS_TONE: Record<VehicleStatus, "neutral" | "brand" | "amber" | "flame"> = {
  draft: "neutral",
  pending: "amber",
  approved: "brand",
  rejected: "flame",
  suspended: "flame",
};

/**
 * One bus, and whatever is standing between it and carrying riders.
 *
 * The four photograph slots are the page. Everything else — the plate, the
 * capacity, HQ's verdict — is a line of text above them, because the only
 * thing an owner comes here to do is add a picture or press send.
 */
export default async function BusPage({ params }: PageProps) {
  const owner = await getOwnerSession();
  if (!owner) redirect("/");

  const { vehicleId } = await params;
  const bus = getVehicleForOwner(vehicleId, owner.id);
  if (!bus) notFound();

  const photos = vehiclePhotos(bus.id);
  const byAngle = new Map(photos.map((p) => [p.angle, p.id]));
  const missing = REQUIRED_ANGLES.filter((a) => !byAngle.has(a));

  const locked = bus.status === "approved" || bus.status === "suspended";
  const canSubmit = bus.status === "draft" || bus.status === "rejected";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Link
          href="/fleet"
          className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-body"
        >
          ← My buses
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="tabular text-2xl font-semibold tracking-tight text-body">{bus.plate}</h1>
          <Badge tone={STATUS_TONE[bus.status]}>{VEHICLE_STATUS_LABEL[bus.status]}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          {bus.model} · {BODY_TYPE_LABEL[bus.bodyType]} · carries {bus.capacity}
          {bus.wifi ? " · Wi-Fi" : ""}
        </p>
      </header>

      {bus.status === "rejected" && bus.reviewNote ? (
        <p className="flex items-start gap-3 rounded-2xl bg-flame-soft px-4 py-3.5 text-sm leading-relaxed text-flame">
          <AlertIcon className="mt-0.5 size-5 shrink-0" />
          <span>
            <b>Vayliron turned this down.</b> {bus.reviewNote} Fix it, replace the photograph and
            send it again.
          </span>
        </p>
      ) : null}

      {bus.status === "pending" ? (
        <p className="flex items-start gap-3 rounded-2xl bg-amber-soft px-4 py-3.5 text-sm leading-relaxed text-amber">
          <ClockIcon className="mt-0.5 size-5 shrink-0" />
          <span>
            Sent to Vayliron on {formatServiceDate((bus.submittedAt ?? "").slice(0, 10))}. Nothing
            more to do — they will come back to you, usually within a working day.
          </span>
        </p>
      ) : null}

      {bus.status === "approved" ? (
        <p className="flex items-start gap-3 rounded-2xl bg-brand-soft px-4 py-3.5 text-sm leading-relaxed text-accent">
          <CheckIcon className="mt-0.5 size-5 shrink-0" />
          <span>
            Approved by {bus.reviewedBy ?? "Vayliron"} on{" "}
            {formatServiceDate((bus.reviewedAt ?? "").slice(0, 10))}. This bus can be rostered onto
            departures and every fare it carries is split {owner.payoutBps / 100}% to you.
          </span>
        </p>
      ) : null}

      {bus.status === "suspended" && bus.reviewNote ? (
        <p className="flex items-start gap-3 rounded-2xl bg-flame-soft px-4 py-3.5 text-sm leading-relaxed text-flame">
          <AlertIcon className="mt-0.5 size-5 shrink-0" />
          <span>
            <b>Pulled off the network.</b> {bus.reviewNote} Contact Vayliron to have it reinstated.
          </span>
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="Photographs"
          subtitle="What a controller looks at before they let a bus carry people"
          action={
            <span className="tabular text-xs text-faint">
              {REQUIRED_ANGLES.length - missing.length} of {REQUIRED_ANGLES.length}
            </span>
          }
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {REQUIRED_ANGLES.map((angle) => (
            <PhotoUpload
              key={angle}
              vehicleId={bus.id}
              angle={angle}
              label={ANGLE_LABEL[angle]}
              hint={ANGLE_HINT[angle]}
              existingId={byAngle.get(angle) ?? null}
              locked={locked}
            />
          ))}
        </div>
      </Card>

      {canSubmit ? (
        <Card>
          <CardHeader
            title="Send it to Vayliron"
            subtitle={
              missing.length === 0
                ? "Everything they need is here"
                : `Still missing ${missing.length} of ${REQUIRED_ANGLES.length} photographs`
            }
          />
          <div className="px-5 py-5">
            <ActionForm
              action={submitVehicleAction}
              submit={
                bus.status === "rejected" ? "Send it back for review" : "Submit for approval"
              }
              fullWidthSubmit
            >
              <input type="hidden" name="vehicleId" value={bus.id} />
              <p className="text-sm leading-relaxed text-muted">
                A controller will look at the four photographs and either approve {bus.plate} or
                tell you what to fix. You will see their answer on this page.
              </p>
            </ActionForm>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
