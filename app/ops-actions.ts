"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { FormState } from "@/app/actions";
import { getNetworkAdmin, getOperatorSession } from "@/lib/auth";
import {
  cancelTrip,
  createDriver,
  createStop,
  createVehicle,
  OpsError,
  reassignDriver,
  reassignVehicle,
  reinstateTrip,
  resolveIncident,
  setDriverActive,
  setRouteActive,
  setTripDelay,
  updateCompanyContract,
} from "@/lib/ops";

function refreshOps(tripId?: string): void {
  revalidatePath("/ops");
  revalidatePath("/ops/trips");
  revalidatePath("/ops/fleet");
  revalidatePath("/ops/network");
  revalidatePath("/ops/clients");
  if (tripId) revalidatePath(`/ops/trips/${tripId}`);
}

/* ------------------------------------------------------------------ *
 * Controlling departures
 * ------------------------------------------------------------------ */

export async function cancelTripAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getOperatorSession())) return { error: "Only Vayliron control can cancel a run." };

  const tripId = String(formData.get("tripId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!tripId) return { error: "No departure selected." };
  if (reason.length < 3) return { error: "Give a reason — riders and the audit trail need one." };

  try {
    const released = cancelTrip(tripId, reason);
    refreshOps(tripId);
    return {
      message:
        released > 0
          ? `Cancelled. ${released} booked ${released === 1 ? "seat has" : "seats have"} been released and removed from riders' trips.`
          : "Cancelled. No seats were sold on this departure.",
    };
  } catch (err) {
    if (err instanceof OpsError) return { error: err.message };
    throw err;
  }
}

export async function reinstateTripAction(formData: FormData): Promise<void> {
  if (!(await getOperatorSession())) return;
  const tripId = String(formData.get("tripId") ?? "");
  if (tripId) reinstateTrip(tripId);
  refreshOps(tripId);
}

export async function reassignAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getOperatorSession())) return { error: "Only Vayliron control can reassign a run." };

  const tripId = String(formData.get("tripId") ?? "");
  const vehicleId = String(formData.get("vehicleId") ?? "");
  const driverId = String(formData.get("driverId") ?? "");
  if (!tripId) return { error: "No departure selected." };

  try {
    if (vehicleId) reassignVehicle(tripId, vehicleId);
    if (driverId) reassignDriver(tripId, driverId);
  } catch (err) {
    if (err instanceof OpsError) return { error: err.message };
    throw err;
  }

  refreshOps(tripId);
  return { message: "Departure reassigned." };
}

export async function opsSetDelayAction(formData: FormData): Promise<void> {
  if (!(await getOperatorSession())) return;
  const tripId = String(formData.get("tripId") ?? "");
  const minutes = Number(formData.get("delayMinutes") ?? 0);
  if (tripId && !Number.isNaN(minutes)) setTripDelay(tripId, minutes);
  refreshOps(tripId);
}

export async function resolveIncidentAction(formData: FormData): Promise<void> {
  if (!(await getOperatorSession())) return;
  const incidentId = String(formData.get("incidentId") ?? "");
  if (incidentId) resolveIncident(incidentId);
  refreshOps();
}

/* ------------------------------------------------------------------ *
 * Fleet (network admin only)
 * ------------------------------------------------------------------ */

const vehicleSchema = z.object({
  plate: z
    .string()
    .trim()
    .min(6)
    .max(10)
    // Kenyan civilian plates: three letters, three digits, a check letter.
    .regex(/^K[A-Z]{2}\s?\d{3}[A-Z]$/i, "Use a Kenyan plate, for example KDG 411R."),
  model: z.string().trim().min(2).max(60),
  capacity: z.coerce.number().int().min(8).max(90),
  wifi: z.coerce.boolean(),
  operator: z.string().trim().min(2).max(60),
});

export async function createVehicleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await getNetworkAdmin())) return { error: "Adding a bus needs network admin rights." };

  const parsed = vehicleSchema.safeParse({
    plate: formData.get("plate"),
    model: formData.get("model"),
    capacity: formData.get("capacity"),
    wifi: formData.get("wifi") === "on",
    operator: formData.get("operator") || "Vayliron Fleet",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the vehicle details." };
  }

  try {
    createVehicle({
      plate: parsed.data.plate,
      model: parsed.data.model,
      capacity: parsed.data.capacity,
      wifi: parsed.data.wifi,
      usbPorts: parsed.data.wifi ? parsed.data.capacity : 0,
      operator: parsed.data.operator,
    });
  } catch (err) {
    if (String(err).includes("UNIQUE")) return { error: "That plate is already in the fleet." };
    throw err;
  }

  refreshOps();
  return { message: `${parsed.data.plate.toUpperCase()} added to the fleet.` };
}

const driverSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^\+254\d{9}$/, "Use a +254 number, for example +254712345678."),
  psvLicence: z.string().trim().min(4).max(24),
  email: z.string().trim().email().max(120),
});

export async function createDriverAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getNetworkAdmin())) return { error: "Adding a driver needs network admin rights." };

  const parsed = driverSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    psvLicence: formData.get("psvLicence"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the driver details." };
  }

  try {
    createDriver(parsed.data);
  } catch (err) {
    if (String(err).includes("UNIQUE")) {
      return { error: "That PSV badge or email is already on the roster." };
    }
    throw err;
  }

  refreshOps();
  return { message: `${parsed.data.name} added. They can sign in with ${parsed.data.email}.` };
}

export async function setDriverActiveAction(formData: FormData): Promise<void> {
  if (!(await getNetworkAdmin())) return;
  const driverId = String(formData.get("driverId") ?? "");
  const active = formData.get("active") === "1";
  if (driverId) setDriverActive(driverId, active);
  refreshOps();
}

/* ------------------------------------------------------------------ *
 * Network and contracts (network admin only)
 * ------------------------------------------------------------------ */

export async function setRouteActiveAction(formData: FormData): Promise<void> {
  if (!(await getNetworkAdmin())) return;
  const routeId = String(formData.get("routeId") ?? "");
  const active = formData.get("active") === "1";
  if (routeId) setRouteActive(routeId, active);
  refreshOps();
  revalidatePath("/routes");
}

const stopSchema = z.object({
  name: z.string().trim().min(2).max(60),
  area: z.string().trim().min(2).max(60),
  landmark: z.string().trim().min(2).max(80),
  lat: z.coerce.number().min(-2.5).max(-0.5),
  lng: z.coerce.number().min(36).max(37.6),
});

export async function createStopAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getNetworkAdmin())) return { error: "Adding a stage needs network admin rights." };

  const parsed = stopSchema.safeParse({
    name: formData.get("name"),
    area: formData.get("area"),
    landmark: formData.get("landmark"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Check the stage details — coordinates must be inside greater Nairobi.",
    };
  }

  createStop(parsed.data);
  refreshOps();
  return { message: `${parsed.data.name} added. Put it on a line to start selling seats to it.` };
}

const contractSchema = z.object({
  companyId: z.string().min(1),
  subsidyPct: z.coerce.number().min(0).max(100),
  monthlyCapKes: z.coerce.number().int().min(0).max(1000000),
});

export async function updateContractAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await getNetworkAdmin())) {
    return { error: "Changing a client contract needs network admin rights." };
  }

  const parsed = contractSchema.safeParse({
    companyId: formData.get("companyId"),
    subsidyPct: formData.get("subsidyPct"),
    monthlyCapKes: formData.get("monthlyCapKes"),
  });
  if (!parsed.success) return { error: "Check the contract terms." };

  updateCompanyContract(parsed.data.companyId, {
    subsidyBps: Math.round(parsed.data.subsidyPct * 100),
    monthlyCapKes: parsed.data.monthlyCapKes,
  });

  refreshOps();
  revalidatePath("/company");
  return { message: "Contract updated. It applies to bookings made from now on." };
}
