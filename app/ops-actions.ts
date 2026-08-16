"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { FormState } from "@/app/actions";
import type { Actor } from "@/lib/audit";
import { getNetworkAdmin, getOperatorSession } from "@/lib/auth";
import {
  approveVehicle,
  OwnerError,
  reinstateVehicle,
  rejectVehicle,
  suspendVehicle,
} from "@/lib/owners";
import type { Operator } from "@/lib/types";
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

const asActor = (operator: Operator): Actor => ({
  kind: "operator",
  id: operator.id,
  name: operator.name,
});

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
  const operator = await getOperatorSession();
  if (!operator) return { error: "Only Vayliron control can cancel a run." };

  const tripId = String(formData.get("tripId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!tripId) return { error: "No departure selected." };
  if (reason.length < 3) return { error: "Give a reason — riders and the audit trail need one." };

  try {
    const released = cancelTrip(tripId, reason, asActor(operator));
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
  const operator = await getOperatorSession();
  if (!operator) return;
  const tripId = String(formData.get("tripId") ?? "");
  if (tripId) reinstateTrip(tripId, asActor(operator));
  refreshOps(tripId);
}

export async function reassignAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const operator = await getOperatorSession();
  if (!operator) return { error: "Only Vayliron control can reassign a run." };

  const tripId = String(formData.get("tripId") ?? "");
  const vehicleId = String(formData.get("vehicleId") ?? "");
  const driverId = String(formData.get("driverId") ?? "");
  if (!tripId) return { error: "No departure selected." };

  try {
    if (vehicleId) reassignVehicle(tripId, vehicleId, asActor(operator));
    if (driverId) reassignDriver(tripId, driverId, asActor(operator));
  } catch (err) {
    if (err instanceof OpsError) return { error: err.message };
    throw err;
  }

  refreshOps(tripId);
  return { message: "Departure reassigned." };
}

export async function opsSetDelayAction(formData: FormData): Promise<void> {
  const operator = await getOperatorSession();
  if (!operator) return;
  const tripId = String(formData.get("tripId") ?? "");
  const minutes = Number(formData.get("delayMinutes") ?? 0);
  if (tripId && !Number.isNaN(minutes)) setTripDelay(tripId, minutes, asActor(operator));
  refreshOps(tripId);
}

export async function resolveIncidentAction(formData: FormData): Promise<void> {
  const operator = await getOperatorSession();
  if (!operator) return;
  const incidentId = String(formData.get("incidentId") ?? "");
  if (incidentId) resolveIncident(incidentId, asActor(operator));
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
  const admin = await getNetworkAdmin();
  if (!admin) return { error: "Adding a bus needs network admin rights." };

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
    createVehicle(
      {
        plate: parsed.data.plate,
        model: parsed.data.model,
        capacity: parsed.data.capacity,
        wifi: parsed.data.wifi,
        usbPorts: parsed.data.wifi ? parsed.data.capacity : 0,
        operator: parsed.data.operator,
      },
      asActor(admin),
    );
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
  const admin = await getNetworkAdmin();
  if (!admin) return { error: "Adding a driver needs network admin rights." };

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
    createDriver(parsed.data, asActor(admin));
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
  const admin = await getNetworkAdmin();
  if (!admin) return;
  const driverId = String(formData.get("driverId") ?? "");
  const active = formData.get("active") === "1";
  if (driverId) setDriverActive(driverId, active, asActor(admin));
  refreshOps();
}

/* ------------------------------------------------------------------ *
 * Network and contracts (network admin only)
 * ------------------------------------------------------------------ */

export async function setRouteActiveAction(formData: FormData): Promise<void> {
  const admin = await getNetworkAdmin();
  if (!admin) return;
  const routeId = String(formData.get("routeId") ?? "");
  const active = formData.get("active") === "1";
  if (routeId) setRouteActive(routeId, active, asActor(admin));
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
  const admin = await getNetworkAdmin();
  if (!admin) return { error: "Adding a stage needs network admin rights." };

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

  createStop(parsed.data, asActor(admin));
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
  const admin = await getNetworkAdmin();
  if (!admin) {
    return { error: "Changing a client contract needs network admin rights." };
  }

  const parsed = contractSchema.safeParse({
    companyId: formData.get("companyId"),
    subsidyPct: formData.get("subsidyPct"),
    monthlyCapKes: formData.get("monthlyCapKes"),
  });
  if (!parsed.success) return { error: "Check the contract terms." };

  updateCompanyContract(
    parsed.data.companyId,
    {
      subsidyBps: Math.round(parsed.data.subsidyPct * 100),
      monthlyCapKes: parsed.data.monthlyCapKes,
    },
    asActor(admin),
  );

  refreshOps();
  revalidatePath("/company");
  return { message: "Contract updated. It applies to bookings made from now on." };
}

/* ------------------------------------------------------------------ *
 * Vehicle approvals
 *
 * The network does not own its buses, so letting one carry people is a real
 * decision made by a named person against photographs. Every outcome here is
 * audited, and a rejection has to say why — an owner who is told "no" with no
 * reason cannot fix anything.
 * ------------------------------------------------------------------ */

export async function approveVehicleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const operator = await getOperatorSession();
  if (!operator) return { error: "Your session expired. Sign in again." };

  try {
    approveVehicle(String(formData.get("vehicleId") ?? ""), asActor(operator));
  } catch (err) {
    if (err instanceof OwnerError) return { error: err.message };
    throw err;
  }

  refreshApprovals();
  return { message: "Approved. That bus can be rostered from now on." };
}

export async function rejectVehicleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const operator = await getOperatorSession();
  if (!operator) return { error: "Your session expired. Sign in again." };

  try {
    rejectVehicle(
      String(formData.get("vehicleId") ?? ""),
      String(formData.get("reason") ?? ""),
      asActor(operator),
    );
  } catch (err) {
    if (err instanceof OwnerError) return { error: err.message };
    throw err;
  }

  refreshApprovals();
  return { message: "Turned down. The owner sees your reason on their own screen." };
}

export async function suspendVehicleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const operator = await getNetworkAdmin();
  if (!operator) return { error: "Only a network admin can pull a bus off the network." };

  try {
    suspendVehicle(
      String(formData.get("vehicleId") ?? ""),
      String(formData.get("reason") ?? ""),
      asActor(operator),
    );
  } catch (err) {
    if (err instanceof OwnerError) return { error: err.message };
    throw err;
  }

  refreshApprovals();
  return {
    message:
      "Suspended. Departures already rostered on it are untouched — move those from the departure screen.",
  };
}

export async function reinstateVehicleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const operator = await getNetworkAdmin();
  if (!operator) return { error: "Only a network admin can put a bus back on the network." };

  try {
    reinstateVehicle(String(formData.get("vehicleId") ?? ""), asActor(operator));
  } catch (err) {
    if (err instanceof OwnerError) return { error: err.message };
    throw err;
  }

  refreshApprovals();
  return { message: "Back on the network." };
}

function refreshApprovals(): void {
  revalidatePath("/ops");
  revalidatePath("/ops/approvals");
  revalidatePath("/ops/fleet");
  revalidatePath("/fleet");
}
