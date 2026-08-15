"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { FormState } from "@/app/actions";
import type { Actor } from "@/lib/audit";
import { actorFrom, getDriverSession, getOperatorSession, getPrincipal } from "@/lib/auth";
import {
  markStopArrived,
  raiseIncident,
  setTripDelay,
  setTripStatus,
} from "@/lib/ops";
import { boardByPassCode, closeTrip, getTrip } from "@/lib/queries";
import type { IncidentKind } from "@/lib/types";

/**
 * Anyone who can work a departure: the driver rostered on it, or a Vayliron
 * controller covering for them from the office.
 */
async function requireCrew(
  tripId: string,
): Promise<{ ok: true; actor: Actor } | { ok: false; error: string }> {
  const principal = await getPrincipal();
  if (!principal) return { ok: false, error: "Your session expired. Sign in again." };

  if (principal.kind === "operator") {
    return { ok: true, actor: actorFrom(principal) };
  }

  if (principal.kind === "driver") {
    const trip = getTrip(tripId);
    if (!trip) return { ok: false, error: "That departure no longer exists." };
    if (trip.trip.driverId !== principal.driver.id) {
      return { ok: false, error: "You are not rostered on that departure." };
    }
    return { ok: true, actor: actorFrom(principal) };
  }

  return { ok: false, error: "Only drivers and control can work a departure." };
}

function refresh(tripId: string): void {
  revalidatePath("/drive");
  revalidatePath(`/drive/${tripId}`);
  revalidatePath("/ops");
  revalidatePath(`/ops/trips/${tripId}`);
}

/* ------------------------------------------------------------------ *
 * Working the door
 * ------------------------------------------------------------------ */

export async function boardPassAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const tripId = String(formData.get("tripId") ?? "");
  const passCode = String(formData.get("passCode") ?? "").trim();

  const crew = await requireCrew(tripId);
  if (!crew.ok) return { error: crew.error };
  if (!passCode) return { error: "Enter a boarding pass code." };

  const result = boardByPassCode(tripId, passCode);
  refresh(tripId);

  if (result.ok) {
    return {
      message: `Seat ${result.entry.booking.seatNo} · ${result.entry.employee.name} (${result.entry.companyName}) — boarded at ${result.entry.boardStop.name}.`,
    };
  }

  switch (result.reason) {
    case "already_boarded":
      return { error: "That pass has already been scanned on this bus." };
    case "wrong_trip":
      return { error: "That pass is for a different departure." };
    default:
      return { error: "No booking matches that code." };
  }
}

/* ------------------------------------------------------------------ *
 * Running the run
 * ------------------------------------------------------------------ */

export async function startRunAction(formData: FormData): Promise<void> {
  const tripId = String(formData.get("tripId") ?? "");
  const crew = await requireCrew(tripId);
  if (!crew.ok) return;

  setTripStatus(tripId, "in_transit", crew.actor);
  refresh(tripId);
}

export async function openBoardingAction(formData: FormData): Promise<void> {
  const tripId = String(formData.get("tripId") ?? "");
  const crew = await requireCrew(tripId);
  if (!crew.ok) return;

  setTripStatus(tripId, "boarding", crew.actor);
  refresh(tripId);
}

export async function markArrivedAction(formData: FormData): Promise<void> {
  const tripId = String(formData.get("tripId") ?? "");
  const stopId = String(formData.get("stopId") ?? "");
  const crew = await requireCrew(tripId);
  if (!crew.ok || !stopId) return;

  markStopArrived(tripId, stopId, crew.actor);
  refresh(tripId);
}

export async function endRunAction(formData: FormData): Promise<void> {
  const tripId = String(formData.get("tripId") ?? "");
  const crew = await requireCrew(tripId);
  if (!crew.ok) return;

  closeTrip(tripId, crew.actor);
  refresh(tripId);
  redirect("/drive");
}

/* ------------------------------------------------------------------ *
 * Incidents
 * ------------------------------------------------------------------ */

const incidentSchema = z.object({
  tripId: z.string().min(1),
  kind: z.enum(["traffic", "breakdown", "accident", "security", "weather", "other"]),
  note: z.string().trim().min(3).max(400),
  delayMinutes: z.coerce.number().int().min(0).max(240),
});

export async function reportIncidentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = incidentSchema.safeParse({
    tripId: formData.get("tripId"),
    kind: formData.get("kind"),
    note: formData.get("note"),
    delayMinutes: formData.get("delayMinutes") || 0,
  });
  if (!parsed.success) {
    return { error: "Pick what happened and describe it in a few words." };
  }

  const crew = await requireCrew(parsed.data.tripId);
  if (!crew.ok) return { error: crew.error };

  raiseIncident(
    {
      tripId: parsed.data.tripId,
      kind: parsed.data.kind as IncidentKind,
      note: parsed.data.note,
      delayMinutes: parsed.data.delayMinutes,
    },
    crew.actor,
  );

  refresh(parsed.data.tripId);
  return {
    message:
      parsed.data.delayMinutes > 0
        ? `Reported. Control can see it, and every rider on this run now sees a ${parsed.data.delayMinutes} minute delay.`
        : "Reported. Control can see it.",
  };
}

/** Lets a driver correct the running delay by hand when the estimate drifts. */
export async function setDelayAction(formData: FormData): Promise<void> {
  const tripId = String(formData.get("tripId") ?? "");
  const minutes = Number(formData.get("delayMinutes") ?? 0);
  const crew = await requireCrew(tripId);
  if (!crew.ok || Number.isNaN(minutes)) return;

  setTripDelay(tripId, minutes, crew.actor);
  refresh(tripId);
}

/** Guards used by the driver pages themselves. */
export async function assertDriverOrOperator(): Promise<boolean> {
  return Boolean((await getDriverSession()) ?? (await getOperatorSession()));
}
