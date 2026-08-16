import "server-only";

import fs from "node:fs";
import path from "node:path";

import { record, type Actor } from "@/lib/audit";
import { db, tx } from "@/lib/db";
import type { BodyType, Owner, PhotoAngle, Vehicle, VehicleStatus } from "@/lib/types";

/**
 * Bus owners, and the vehicles they put on the network.
 *
 * Nairobi's buses are privately owned — a SACCO, or one person with a loan and
 * a matatu. Vayliron runs the network they work on, which means the fleet is
 * not something Vayliron adds: an owner submits a bus with photographs, and
 * HQ either lets it carry people or does not. Until it is approved a vehicle
 * cannot be rostered, so `status` is load-bearing rather than decorative.
 */

type Row = Record<string, unknown>;

const PHOTO_DIR = path.join(process.cwd(), "data", "vehicle-photos");

export class OwnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerError";
  }
}

const toOwner = (r: Row): Owner => ({
  id: r.id as string,
  name: r.name as string,
  kind: r.kind as Owner["kind"],
  contactName: r.contact_name as string,
  email: r.email as string,
  phone: r.phone as string,
  kraPin: r.kra_pin as string,
  payoutBps: r.payout_bps as number,
  active: r.active as number,
  createdAt: r.created_at as string,
});

const toVehicle = (r: Row): Vehicle => ({
  id: r.id as string,
  plate: r.plate as string,
  model: r.model as string,
  capacity: r.capacity as number,
  wifi: r.wifi as number,
  usbPorts: r.usb_ports as number,
  operator: r.operator as string,
  ownerId: (r.owner_id as string) ?? null,
  bodyType: (r.body_type as BodyType) ?? "bus",
  status: (r.status as VehicleStatus) ?? "approved",
  submittedAt: (r.submitted_at as string) ?? null,
  reviewedAt: (r.reviewed_at as string) ?? null,
  reviewedBy: (r.reviewed_by as string) ?? null,
  reviewNote: (r.review_note as string) ?? null,
});

/* ------------------------------------------------------------------ *
 * Owner directory
 * ------------------------------------------------------------------ */

export function getOwner(id: string): Owner | null {
  const row = db().prepare("SELECT * FROM owners WHERE id = ?").get(id) as Row | undefined;
  return row ? toOwner(row) : null;
}

export function getOwnerByEmail(email: string): Owner | null {
  const row = db()
    .prepare("SELECT * FROM owners WHERE lower(email) = lower(?)")
    .get(email.trim()) as Row | undefined;
  return row ? toOwner(row) : null;
}

export function listOwners(): Owner[] {
  return (db().prepare("SELECT * FROM owners ORDER BY name").all() as Row[]).map(toOwner);
}

/* ------------------------------------------------------------------ *
 * The owner's own fleet
 * ------------------------------------------------------------------ */

export interface OwnedVehicle extends Vehicle {
  photos: VehiclePhotoRef[];
  /** Runs worked and fares earned across the window the caller asked for. */
  runs: number;
  ridersCarried: number;
  earnedKes: number;
}

export interface VehiclePhotoRef {
  id: string;
  angle: PhotoAngle;
  mime: string;
}

export function vehiclePhotos(vehicleId: string): VehiclePhotoRef[] {
  return (
    db()
      .prepare(
        "SELECT id, angle, mime FROM vehicle_photos WHERE vehicle_id = ? ORDER BY uploaded_at",
      )
      .all(vehicleId) as Row[]
  ).map((r) => ({
    id: r.id as string,
    angle: r.angle as PhotoAngle,
    mime: r.mime as string,
  }));
}

/**
 * Everything an owner sees about their own buses: what state each one is in
 * with HQ, and what it has earned them since a given date.
 */
export function ownedVehicles(ownerId: string, since: string): OwnedVehicle[] {
  const rows = db()
    .prepare("SELECT * FROM vehicles WHERE owner_id = ? ORDER BY plate")
    .all(ownerId) as Row[];

  const earnings = db().prepare(
    `SELECT COUNT(DISTINCT t.id) AS runs,
            COUNT(p.id)          AS riders,
            COALESCE(SUM(p.owner_kes), 0) AS earned
       FROM trips t
       JOIN bookings b ON b.trip_id = t.id AND b.status IN ('booked','boarded')
       JOIN payments p ON p.booking_id = b.id AND p.status = 'paid'
      WHERE t.vehicle_id = ? AND t.service_date >= ?`,
  );

  return rows.map((r) => {
    const stats = earnings.get(r.id as string, since) as Row;
    return {
      ...toVehicle(r),
      photos: vehiclePhotos(r.id as string),
      runs: (stats.runs as number) ?? 0,
      ridersCarried: (stats.riders as number) ?? 0,
      earnedKes: (stats.earned as number) ?? 0,
    };
  });
}

export function getVehicleForOwner(vehicleId: string, ownerId: string): Vehicle | null {
  const row = db()
    .prepare("SELECT * FROM vehicles WHERE id = ? AND owner_id = ?")
    .get(vehicleId, ownerId) as Row | undefined;
  return row ? toVehicle(row) : null;
}

/* ------------------------------------------------------------------ *
 * Adding a bus
 * ------------------------------------------------------------------ */

export interface NewVehicle {
  plate: string;
  model: string;
  bodyType: BodyType;
  capacity: number;
  wifi: boolean;
  usbPorts: number;
}

/** Kenyan civilian plates: three letters, three digits, one letter. KDA 123A. */
const PLATE = /^K[A-Z]{2}\s?\d{3}[A-Z]$/;

export function normalisePlate(input: string): string {
  const squashed = input.toUpperCase().replace(/\s+/g, "");
  if (squashed.length < 7) return squashed;
  return `${squashed.slice(0, 3)} ${squashed.slice(3)}`;
}

/**
 * Registers a bus as a draft. It carries nobody until the owner has added
 * photographs and submitted it, and HQ has approved it.
 */
export function addVehicle(ownerId: string, input: NewVehicle, actor: Actor): string {
  const owner = getOwner(ownerId);
  if (!owner) throw new OwnerError("That owner account no longer exists.");

  const plate = normalisePlate(input.plate);
  if (!PLATE.test(plate)) {
    throw new OwnerError("That is not a Kenyan number plate. It should read like KDA 123A.");
  }
  if (!input.model.trim()) throw new OwnerError("Tell us the make and model of the bus.");
  if (!Number.isInteger(input.capacity) || input.capacity < 7 || input.capacity > 90) {
    throw new OwnerError("A bus on this network carries between 7 and 90 people.");
  }

  const existing = db().prepare("SELECT owner_id FROM vehicles WHERE plate = ?").get(plate) as
    | Row
    | undefined;
  if (existing) {
    throw new OwnerError(
      existing.owner_id === ownerId
        ? "That plate is already on your fleet."
        : "That plate is already registered on the network. Contact Vayliron if this is your bus.",
    );
  }

  const id = `veh_${crypto.randomUUID().slice(0, 12)}`;
  db()
    .prepare(
      `INSERT INTO vehicles
         (id, plate, model, capacity, wifi, usb_ports, operator, owner_id, body_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
    )
    .run(
      id,
      plate,
      input.model.trim(),
      input.capacity,
      input.wifi ? 1 : 0,
      input.usbPorts,
      owner.name,
      ownerId,
      input.bodyType,
    );

  record({
    actor,
    action: "vehicle.add",
    subjectKind: "vehicle",
    subjectId: id,
    subjectLabel: plate,
    summary: `${actor.name} added ${plate} (${input.model.trim()}, ${input.capacity} seats) to their fleet.`,
  });

  return id;
}

/* ------------------------------------------------------------------ *
 * Photographs
 * ------------------------------------------------------------------ */

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** The four angles HQ needs before it can judge a bus it has never seen. */
export const REQUIRED_ANGLES: PhotoAngle[] = ["exterior", "interior", "plate", "logbook"];

export const ANGLE_LABEL: Record<PhotoAngle, string> = {
  exterior: "The bus from outside",
  interior: "Inside, down the aisle",
  plate: "The number plate, readable",
  logbook: "The logbook or PSV licence",
};

export function savePhoto(
  vehicleId: string,
  ownerId: string,
  angle: PhotoAngle,
  mime: string,
  data: Buffer,
): void {
  const vehicle = getVehicleForOwner(vehicleId, ownerId);
  if (!vehicle) throw new OwnerError("That bus is not on your fleet.");
  if (vehicle.status === "approved" || vehicle.status === "suspended") {
    throw new OwnerError("An approved bus cannot have its photographs swapped. Contact Vayliron.");
  }

  const extension = ALLOWED_MIME[mime];
  if (!extension) throw new OwnerError("Photographs must be JPEG, PNG or WebP.");
  if (data.byteLength === 0) throw new OwnerError("That file was empty.");
  if (data.byteLength > MAX_PHOTO_BYTES) throw new OwnerError("Each photograph must be under 6 MB.");

  const id = `vph_${crypto.randomUUID().slice(0, 12)}`;
  const filename = `${id}.${extension}`;

  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  fs.writeFileSync(path.join(PHOTO_DIR, filename), data);

  tx((conn) => {
    // One photograph per angle. Re-uploading replaces rather than piles up.
    const old = conn
      .prepare("SELECT id, filename FROM vehicle_photos WHERE vehicle_id = ? AND angle = ?")
      .all(vehicleId, angle) as Row[];
    for (const row of old) {
      removeFile(row.filename as string);
      conn.prepare("DELETE FROM vehicle_photos WHERE id = ?").run(row.id as string);
    }

    conn
      .prepare(
        `INSERT INTO vehicle_photos (id, vehicle_id, angle, mime, bytes, filename, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, vehicleId, angle, mime, data.byteLength, filename, new Date().toISOString());
  });
}

/**
 * Reads a photograph back for the viewer route.
 *
 * Returns the owning account alongside the bytes: these are logbooks and
 * number plates, so the route has to be able to check that the person asking
 * is the owner who uploaded it, not merely some owner.
 */
export function readPhoto(
  photoId: string,
): { mime: string; data: Buffer; ownerId: string | null } | null {
  const row = db()
    .prepare(
      `SELECT p.mime, p.filename, v.owner_id
         FROM vehicle_photos p JOIN vehicles v ON v.id = p.vehicle_id
        WHERE p.id = ?`,
    )
    .get(photoId) as Row | undefined;
  if (!row) return null;

  const file = path.join(PHOTO_DIR, row.filename as string);
  if (!fs.existsSync(file)) return null;

  return {
    mime: row.mime as string,
    data: fs.readFileSync(file),
    ownerId: (row.owner_id as string) ?? null,
  };
}

function removeFile(filename: string): void {
  try {
    fs.unlinkSync(path.join(PHOTO_DIR, filename));
  } catch {
    // A missing file is not worth failing a database write over.
  }
}

/* ------------------------------------------------------------------ *
 * Submitting for approval
 * ------------------------------------------------------------------ */

export function submitForApproval(vehicleId: string, ownerId: string, actor: Actor): void {
  const vehicle = getVehicleForOwner(vehicleId, ownerId);
  if (!vehicle) throw new OwnerError("That bus is not on your fleet.");
  if (vehicle.status === "pending") throw new OwnerError("That bus is already with Vayliron.");
  if (vehicle.status === "approved") throw new OwnerError("That bus is already approved.");
  if (vehicle.status === "suspended") {
    throw new OwnerError("That bus is suspended. Vayliron has to lift that before you resubmit.");
  }

  const have = new Set(vehiclePhotos(vehicleId).map((p) => p.angle));
  const missing = REQUIRED_ANGLES.filter((angle) => !have.has(angle));
  if (missing.length > 0) {
    throw new OwnerError(
      `Add ${missing.length} more ${missing.length === 1 ? "photograph" : "photographs"}: ${missing
        .map((a) => ANGLE_LABEL[a].toLowerCase())
        .join(", ")}.`,
    );
  }

  db()
    .prepare(
      `UPDATE vehicles
          SET status = 'pending', submitted_at = ?, reviewed_at = NULL,
              reviewed_by = NULL, review_note = NULL
        WHERE id = ?`,
    )
    .run(new Date().toISOString(), vehicleId);

  record({
    actor,
    action: "vehicle.submit",
    subjectKind: "vehicle",
    subjectId: vehicleId,
    subjectLabel: vehicle.plate,
    summary: `${actor.name} submitted ${vehicle.plate} to Vayliron for approval.`,
  });
}

/* ------------------------------------------------------------------ *
 * HQ review
 * ------------------------------------------------------------------ */

export interface PendingVehicle extends Vehicle {
  ownerName: string;
  ownerPhone: string;
  ownerKind: Owner["kind"];
  photos: VehiclePhotoRef[];
}

export function pendingVehicles(): PendingVehicle[] {
  const rows = db()
    .prepare(
      `SELECT v.*, o.name AS owner_name, o.phone AS owner_phone, o.kind AS owner_kind
         FROM vehicles v JOIN owners o ON o.id = v.owner_id
        WHERE v.status = 'pending'
        ORDER BY v.submitted_at`,
    )
    .all() as Row[];

  return rows.map((r) => ({
    ...toVehicle(r),
    ownerName: r.owner_name as string,
    ownerPhone: r.owner_phone as string,
    ownerKind: r.owner_kind as Owner["kind"],
    photos: vehiclePhotos(r.id as string),
  }));
}

export function approveVehicle(vehicleId: string, actor: Actor): void {
  const vehicle = requireVehicle(vehicleId);
  if (vehicle.status !== "pending") {
    throw new OwnerError("That bus is not waiting for a decision.");
  }

  db()
    .prepare(
      `UPDATE vehicles SET status = 'approved', reviewed_at = ?, reviewed_by = ?, review_note = NULL
        WHERE id = ?`,
    )
    .run(new Date().toISOString(), actor.name, vehicleId);

  record({
    actor,
    action: "vehicle.approve",
    subjectKind: "vehicle",
    subjectId: vehicleId,
    subjectLabel: vehicle.plate,
    summary: `${actor.name} approved ${vehicle.plate} to carry riders.`,
  });
}

export function rejectVehicle(vehicleId: string, reason: string, actor: Actor): void {
  const vehicle = requireVehicle(vehicleId);
  if (vehicle.status !== "pending") {
    throw new OwnerError("That bus is not waiting for a decision.");
  }
  const note = reason.trim();
  if (!note) throw new OwnerError("Say why, so the owner knows what to fix.");

  db()
    .prepare(
      `UPDATE vehicles SET status = 'rejected', reviewed_at = ?, reviewed_by = ?, review_note = ?
        WHERE id = ?`,
    )
    .run(new Date().toISOString(), actor.name, note, vehicleId);

  record({
    actor,
    action: "vehicle.reject",
    subjectKind: "vehicle",
    subjectId: vehicleId,
    subjectLabel: vehicle.plate,
    summary: `${actor.name} turned down ${vehicle.plate} — ${note}`,
  });
}

/**
 * Pulls an approved bus off the network.
 *
 * Deliberately does not touch departures already rostered on it: taking a bus
 * out from under 40 booked riders is a decision for a controller looking at
 * those departures, not a side effect of a fleet action.
 */
export function suspendVehicle(vehicleId: string, reason: string, actor: Actor): void {
  const vehicle = requireVehicle(vehicleId);
  if (vehicle.status !== "approved") throw new OwnerError("That bus is not currently approved.");
  const note = reason.trim();
  if (!note) throw new OwnerError("Say why the bus is being pulled.");

  db()
    .prepare(
      `UPDATE vehicles SET status = 'suspended', reviewed_at = ?, reviewed_by = ?, review_note = ?
        WHERE id = ?`,
    )
    .run(new Date().toISOString(), actor.name, note, vehicleId);

  record({
    actor,
    action: "vehicle.suspend",
    subjectKind: "vehicle",
    subjectId: vehicleId,
    subjectLabel: vehicle.plate,
    summary: `${actor.name} suspended ${vehicle.plate} — ${note}`,
  });
}

export function reinstateVehicle(vehicleId: string, actor: Actor): void {
  const vehicle = requireVehicle(vehicleId);
  if (vehicle.status !== "suspended") throw new OwnerError("That bus is not suspended.");

  db()
    .prepare(
      `UPDATE vehicles SET status = 'approved', reviewed_at = ?, reviewed_by = ?, review_note = NULL
        WHERE id = ?`,
    )
    .run(new Date().toISOString(), actor.name, vehicleId);

  record({
    actor,
    action: "vehicle.reinstate",
    subjectKind: "vehicle",
    subjectId: vehicleId,
    subjectLabel: vehicle.plate,
    summary: `${actor.name} put ${vehicle.plate} back on the network.`,
  });
}

function requireVehicle(vehicleId: string): Vehicle {
  const row = db().prepare("SELECT * FROM vehicles WHERE id = ?").get(vehicleId) as Row | undefined;
  if (!row) throw new OwnerError("That bus is not on the network.");
  return toVehicle(row);
}

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  draft: "Not submitted",
  pending: "With Vayliron",
  approved: "Carrying riders",
  rejected: "Turned down",
  suspended: "Suspended",
};

export const BODY_TYPE_LABEL: Record<BodyType, string> = {
  matatu: "Matatu (14 seats)",
  minibus: "Minibus (25–33 seats)",
  bus: "Bus (33–51 seats)",
  coach: "Coach (51+ seats)",
};

/* ------------------------------------------------------------------ *
 * Earnings
 * ------------------------------------------------------------------ */

export interface DailyEarning {
  date: string;
  riders: number;
  grossKes: number;
  ownerKes: number;
}

export interface EarningsSummary {
  grossKes: number;
  ownerKes: number;
  commissionKes: number;
  riders: number;
  pendingKes: number;
  byDay: DailyEarning[];
  byVehicle: { plate: string; riders: number; ownerKes: number }[];
}

/**
 * What an owner is owed, and where it came from.
 *
 * Gross is what riders paid; the owner's share is what they keep after
 * Vayliron's commission. Both are read off the payment rows rather than
 * recomputed from the current rate, because a rate change must not restate a
 * month that has already been paid out.
 */
export function ownerEarnings(ownerId: string, from: string, to: string): EarningsSummary {
  const conn = db();

  const totals = conn
    .prepare(
      `SELECT COALESCE(SUM(p.amount_kes), 0) AS gross,
              COALESCE(SUM(p.owner_kes), 0)  AS owner_share,
              COALESCE(SUM(p.network_kes), 0) AS commission,
              COUNT(p.id) AS riders
         FROM payments p
         JOIN bookings b ON b.id = p.booking_id
         JOIN trips t ON t.id = b.trip_id
         JOIN vehicles v ON v.id = t.vehicle_id
        WHERE v.owner_id = ? AND p.status = 'paid'
          AND t.service_date BETWEEN ? AND ?`,
    )
    .get(ownerId, from, to) as Row;

  const pending = conn
    .prepare(
      `SELECT COALESCE(SUM(p.owner_kes), 0) AS n
         FROM payments p
         JOIN bookings b ON b.id = p.booking_id
         JOIN trips t ON t.id = b.trip_id
         JOIN vehicles v ON v.id = t.vehicle_id
        WHERE v.owner_id = ? AND p.status = 'pending'
          AND t.service_date BETWEEN ? AND ?`,
    )
    .get(ownerId, from, to) as Row;

  const byDay = (
    conn
      .prepare(
        `SELECT t.service_date AS date,
                COUNT(p.id) AS riders,
                COALESCE(SUM(p.amount_kes), 0) AS gross,
                COALESCE(SUM(p.owner_kes), 0) AS owner_share
           FROM payments p
           JOIN bookings b ON b.id = p.booking_id
           JOIN trips t ON t.id = b.trip_id
           JOIN vehicles v ON v.id = t.vehicle_id
          WHERE v.owner_id = ? AND p.status = 'paid'
            AND t.service_date BETWEEN ? AND ?
          GROUP BY t.service_date
          ORDER BY t.service_date`,
      )
      .all(ownerId, from, to) as Row[]
  ).map((r) => ({
    date: r.date as string,
    riders: r.riders as number,
    grossKes: r.gross as number,
    ownerKes: r.owner_share as number,
  }));

  const byVehicle = (
    conn
      .prepare(
        `SELECT v.plate AS plate,
                COUNT(p.id) AS riders,
                COALESCE(SUM(p.owner_kes), 0) AS owner_share
           FROM payments p
           JOIN bookings b ON b.id = p.booking_id
           JOIN trips t ON t.id = b.trip_id
           JOIN vehicles v ON v.id = t.vehicle_id
          WHERE v.owner_id = ? AND p.status = 'paid'
            AND t.service_date BETWEEN ? AND ?
          GROUP BY v.id
          ORDER BY owner_share DESC`,
      )
      .all(ownerId, from, to) as Row[]
  ).map((r) => ({
    plate: r.plate as string,
    riders: r.riders as number,
    ownerKes: r.owner_share as number,
  }));

  return {
    grossKes: totals.gross as number,
    ownerKes: totals.owner_share as number,
    commissionKes: totals.commission as number,
    riders: totals.riders as number,
    pendingKes: pending.n as number,
    byDay,
    byVehicle,
  };
}
