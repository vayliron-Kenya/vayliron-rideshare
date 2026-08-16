"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { actorFrom, getPrincipal } from "@/lib/auth";
import {
  addVehicle,
  OwnerError,
  savePhoto,
  submitForApproval,
  type NewVehicle,
} from "@/lib/owners";
import type { BodyType, PhotoAngle } from "@/lib/types";

/**
 * What a bus owner can do to their own fleet.
 *
 * Every action re-resolves the owner from the session cookie rather than
 * trusting a hidden field, so a vehicle id posted from somewhere else reaches
 * `getVehicleForOwner` and comes back null.
 */

export interface FleetFormState {
  error?: string;
  message?: string;
}

async function owner() {
  const principal = await getPrincipal();
  if (principal?.kind !== "owner") return null;
  return { owner: principal.owner, actor: actorFrom(principal) };
}

const BODY_TYPES: BodyType[] = ["matatu", "minibus", "bus", "coach"];
const ANGLES: PhotoAngle[] = ["exterior", "interior", "plate", "logbook"];

export async function addVehicleAction(
  _prev: FleetFormState,
  formData: FormData,
): Promise<FleetFormState> {
  const session = await owner();
  if (!session) return { error: "Your session expired. Sign in again." };

  const bodyType = String(formData.get("bodyType") ?? "");
  if (!BODY_TYPES.includes(bodyType as BodyType)) {
    return { error: "Pick what kind of vehicle this is." };
  }

  const input: NewVehicle = {
    plate: String(formData.get("plate") ?? ""),
    model: String(formData.get("model") ?? ""),
    bodyType: bodyType as BodyType,
    capacity: Number(formData.get("capacity") ?? 0),
    wifi: formData.get("wifi") === "on",
    usbPorts: Number(formData.get("usbPorts") ?? 0) || 0,
  };

  let vehicleId: string;
  try {
    vehicleId = addVehicle(session.owner.id, input, session.actor);
  } catch (err) {
    if (err instanceof OwnerError) return { error: err.message };
    throw err;
  }

  revalidatePath("/fleet");
  redirect(`/fleet/${vehicleId}`);
}

export async function uploadPhotoAction(
  _prev: FleetFormState,
  formData: FormData,
): Promise<FleetFormState> {
  const session = await owner();
  if (!session) return { error: "Your session expired. Sign in again." };

  const vehicleId = String(formData.get("vehicleId") ?? "");
  const angle = String(formData.get("angle") ?? "");
  if (!ANGLES.includes(angle as PhotoAngle)) return { error: "Unknown photograph." };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photograph to upload." };
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    savePhoto(vehicleId, session.owner.id, angle as PhotoAngle, file.type, bytes);
  } catch (err) {
    if (err instanceof OwnerError) return { error: err.message };
    throw err;
  }

  revalidatePath(`/fleet/${vehicleId}`);
  return { message: "Photograph saved." };
}

export async function submitVehicleAction(
  _prev: FleetFormState,
  formData: FormData,
): Promise<FleetFormState> {
  const session = await owner();
  if (!session) return { error: "Your session expired. Sign in again." };

  const vehicleId = String(formData.get("vehicleId") ?? "");
  try {
    submitForApproval(vehicleId, session.owner.id, session.actor);
  } catch (err) {
    if (err instanceof OwnerError) return { error: err.message };
    throw err;
  }

  revalidatePath("/fleet");
  revalidatePath(`/fleet/${vehicleId}`);
  return { message: "Sent to Vayliron. They usually come back within a working day." };
}
