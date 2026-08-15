/**
 * Reads and writes that belong to the people running the network — Vayliron's
 * own controllers — plus the driver-side and client-admin mutations that the
 * rider app never performs.
 *
 * Kept apart from `lib/queries.ts` so the rider path stays easy to read: that
 * module is what a commuter can do, this one is what staff can do.
 */
import { db, tx } from "@/lib/db";
import { nairobiDate } from "@/lib/domain/time";
import { getTrip, listTrips, type TripSummary } from "@/lib/queries";
import type {
  Company,
  Driver,
  Employee,
  Incident,
  IncidentKind,
  Operator,
  Trip,
  Vehicle,
} from "@/lib/types";

type Row = Record<string, unknown>;

const toOperator = (r: Row): Operator => ({
  id: r.id as string,
  name: r.name as string,
  email: r.email as string,
  phone: r.phone as string,
  role: r.role as Operator["role"],
  active: r.active as number,
});

const toDriver = (r: Row): Driver => ({
  id: r.id as string,
  name: r.name as string,
  phone: r.phone as string,
  psvLicence: r.psv_licence as string,
  ratingBps: r.rating_bps as number,
  email: (r.email as string) ?? null,
  active: (r.active as number) ?? 1,
});

const toVehicle = (r: Row): Vehicle => ({
  id: r.id as string,
  plate: r.plate as string,
  model: r.model as string,
  capacity: r.capacity as number,
  wifi: r.wifi as number,
  usbPorts: r.usb_ports as number,
  operator: r.operator as string,
});

const toEmployee = (r: Row): Employee => ({
  id: r.id as string,
  companyId: r.company_id as string,
  name: r.name as string,
  email: r.email as string,
  phone: r.phone as string,
  staffNo: r.staff_no as string,
  homeStopId: (r.home_stop_id as string) ?? null,
  workStopId: (r.work_stop_id as string) ?? null,
  role: r.role as Employee["role"],
  active: r.active as number,
});

const toIncident = (r: Row): Incident => ({
  id: r.id as string,
  tripId: r.trip_id as string,
  reporterKind: r.reporter_kind as Incident["reporterKind"],
  reporterId: r.reporter_id as string,
  kind: r.kind as IncidentKind,
  note: r.note as string,
  delayMinutes: r.delay_minutes as number,
  createdAt: r.created_at as string,
  resolvedAt: (r.resolved_at as string) ?? null,
});

/* ------------------------------------------------------------------ *
 * Identities
 * ------------------------------------------------------------------ */

export function getOperatorByEmail(email: string): Operator | null {
  const row = db()
    .prepare("SELECT * FROM operators WHERE lower(email) = lower(?) AND active = 1")
    .get(email.trim()) as Row | undefined;
  return row ? toOperator(row) : null;
}

export function getOperator(id: string): Operator | null {
  const row = db().prepare("SELECT * FROM operators WHERE id = ?").get(id) as Row | undefined;
  return row ? toOperator(row) : null;
}

export function listOperators(): Operator[] {
  return db()
    .prepare("SELECT * FROM operators ORDER BY name")
    .all()
    .map((r) => toOperator(r as Row));
}

export function getDriverByEmail(email: string): Driver | null {
  const row = db()
    .prepare("SELECT * FROM drivers WHERE lower(email) = lower(?) AND active = 1")
    .get(email.trim()) as Row | undefined;
  return row ? toDriver(row) : null;
}

/** A couple of real driver logins, for the demo sign-in hints on the landing page. */
export function listDriverLogins(limit = 2): { name: string; email: string }[] {
  return (
    db()
      .prepare(
        "SELECT name, email FROM drivers WHERE email IS NOT NULL AND active = 1 ORDER BY id LIMIT ?",
      )
      .all(limit) as Row[]
  ).map((r) => ({ name: r.name as string, email: r.email as string }));
}

export function getDriver(id: string): Driver | null {
  const row = db().prepare("SELECT * FROM drivers WHERE id = ?").get(id) as Row | undefined;
  return row ? toDriver(row) : null;
}

/* ------------------------------------------------------------------ *
 * Fleet
 * ------------------------------------------------------------------ */

export interface DriverRoster extends Driver {
  runsToday: number;
  seatsSoldToday: number;
}

export function listDrivers(serviceDate = nairobiDate()): DriverRoster[] {
  return (
    db()
      .prepare(
        `SELECT d.*,
                COUNT(DISTINCT t.id) AS runs_today,
                COALESCE(COUNT(b.id), 0) AS seats_today
           FROM drivers d
           LEFT JOIN trips t
             ON t.driver_id = d.id AND t.service_date = ? AND t.status != 'cancelled'
           LEFT JOIN bookings b
             ON b.trip_id = t.id AND b.status IN ('booked','boarded')
          GROUP BY d.id
          ORDER BY runs_today DESC, d.name`,
      )
      .all(serviceDate) as Row[]
  ).map((r) => ({
    ...toDriver(r),
    runsToday: Number(r.runs_today ?? 0),
    seatsSoldToday: Number(r.seats_today ?? 0),
  }));
}

export interface FleetVehicle extends Vehicle {
  runsToday: number;
  seatsSoldToday: number;
  /** Seats sold as a share of seats offered today. */
  loadPct: number;
}

export function listFleet(serviceDate = nairobiDate()): FleetVehicle[] {
  return (
    db()
      .prepare(
        `SELECT v.*,
                COUNT(DISTINCT t.id) AS runs_today,
                COALESCE(COUNT(b.id), 0) AS seats_today
           FROM vehicles v
           LEFT JOIN trips t
             ON t.vehicle_id = v.id AND t.service_date = ? AND t.status != 'cancelled'
           LEFT JOIN bookings b
             ON b.trip_id = t.id AND b.status IN ('booked','boarded')
          GROUP BY v.id
          ORDER BY v.plate`,
      )
      .all(serviceDate) as Row[]
  ).map((r) => {
    const runs = Number(r.runs_today ?? 0);
    const sold = Number(r.seats_today ?? 0);
    const capacity = r.capacity as number;
    const offered = runs * capacity;
    return {
      ...toVehicle(r),
      runsToday: runs,
      seatsSoldToday: sold,
      loadPct: offered === 0 ? 0 : Math.round((sold / offered) * 100),
    };
  });
}

export function createVehicle(input: {
  plate: string;
  model: string;
  capacity: number;
  wifi: boolean;
  usbPorts: number;
  operator: string;
}): string {
  const id = `veh_${crypto.randomUUID().slice(0, 10)}`;
  db()
    .prepare(
      "INSERT INTO vehicles (id, plate, model, capacity, wifi, usb_ports, operator) VALUES (?,?,?,?,?,?,?)",
    )
    .run(
      id,
      input.plate.trim().toUpperCase(),
      input.model.trim(),
      input.capacity,
      input.wifi ? 1 : 0,
      input.usbPorts,
      input.operator.trim(),
    );
  return id;
}

export function createDriver(input: {
  name: string;
  phone: string;
  psvLicence: string;
  email: string;
}): string {
  const id = `drv_${crypto.randomUUID().slice(0, 10)}`;
  db()
    .prepare(
      "INSERT INTO drivers (id, name, phone, psv_licence, rating_bps, email, active) VALUES (?,?,?,?,?,?,1)",
    )
    .run(
      id,
      input.name.trim(),
      input.phone.trim(),
      input.psvLicence.trim().toUpperCase(),
      4500,
      input.email.trim().toLowerCase(),
    );
  return id;
}

export function setDriverActive(driverId: string, active: boolean): void {
  db().prepare("UPDATE drivers SET active = ? WHERE id = ?").run(active ? 1 : 0, driverId);
}

/* ------------------------------------------------------------------ *
 * Running the board
 * ------------------------------------------------------------------ */

export interface NetworkSnapshot {
  serviceDate: string;
  departures: number;
  running: number;
  completed: number;
  cancelled: number;
  seatsOffered: number;
  seatsSold: number;
  loadPct: number;
  revenueKes: number;
  openIncidents: number;
  delayedRuns: number;
  worstDelayMinutes: number;
}

export function networkSnapshot(serviceDate = nairobiDate()): NetworkSnapshot {
  const row = db()
    .prepare(
      `SELECT
         COUNT(*)                                            AS departures,
         COUNT(*) FILTER (WHERE status IN ('boarding','in_transit')) AS running,
         COUNT(*) FILTER (WHERE status = 'completed')        AS completed,
         COUNT(*) FILTER (WHERE status = 'cancelled')        AS cancelled,
         COALESCE(SUM(capacity) FILTER (WHERE status != 'cancelled'), 0) AS seats_offered,
         COUNT(*) FILTER (WHERE delay_minutes > 0 AND status != 'cancelled') AS delayed,
         COALESCE(MAX(delay_minutes), 0)                     AS worst_delay
       FROM trips WHERE service_date = ?`,
    )
    .get(serviceDate) as Row;

  const sales = db()
    .prepare(
      `SELECT COUNT(*) AS sold, COALESCE(SUM(b.fare_kes), 0) AS revenue
         FROM bookings b
         JOIN trips t ON t.id = b.trip_id
        WHERE t.service_date = ? AND b.status IN ('booked','boarded')`,
    )
    .get(serviceDate) as Row;

  const incidents = db()
    .prepare(
      `SELECT COUNT(*) AS n FROM incidents i
         JOIN trips t ON t.id = i.trip_id
        WHERE i.resolved_at IS NULL AND t.service_date = ?`,
    )
    .get(serviceDate) as Row;

  const seatsOffered = Number(row.seats_offered ?? 0);
  const seatsSold = Number(sales.sold ?? 0);

  return {
    serviceDate,
    departures: Number(row.departures ?? 0),
    running: Number(row.running ?? 0),
    completed: Number(row.completed ?? 0),
    cancelled: Number(row.cancelled ?? 0),
    seatsOffered,
    seatsSold,
    loadPct: seatsOffered === 0 ? 0 : Math.round((seatsSold / seatsOffered) * 100),
    revenueKes: Number(sales.revenue ?? 0),
    openIncidents: Number(incidents.n ?? 0),
    delayedRuns: Number(row.delayed ?? 0),
    worstDelayMinutes: Number(row.worst_delay ?? 0),
  };
}

/** Per-line rollup for the operations board. */
export interface LineStatus {
  routeId: string;
  code: string;
  name: string;
  corridor: string;
  departures: number;
  running: number;
  cancelled: number;
  seatsOffered: number;
  seatsSold: number;
  loadPct: number;
  revenueKes: number;
  worstDelayMinutes: number;
}

export function lineStatus(serviceDate = nairobiDate()): LineStatus[] {
  return (
    db()
      .prepare(
        `SELECT r.id AS route_id, r.code, r.name, r.corridor,
                COUNT(DISTINCT t.id) AS departures,
                COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('boarding','in_transit')) AS running,
                COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'cancelled') AS cancelled,
                COALESCE(SUM(t.capacity) FILTER (WHERE t.status != 'cancelled'), 0) AS seats_offered,
                COALESCE(MAX(t.delay_minutes), 0) AS worst_delay
           FROM routes r
           LEFT JOIN trips t ON t.route_id = r.id AND t.service_date = ?
          WHERE r.active = 1
          GROUP BY r.id
          ORDER BY r.code`,
      )
      .all(serviceDate) as Row[]
  ).map((r) => {
    const sales = db()
      .prepare(
        `SELECT COUNT(*) AS sold, COALESCE(SUM(b.fare_kes), 0) AS revenue
           FROM bookings b
           JOIN trips t ON t.id = b.trip_id
          WHERE t.route_id = ? AND t.service_date = ? AND b.status IN ('booked','boarded')`,
      )
      .get(r.route_id, serviceDate) as Row;

    const seatsOffered = Number(r.seats_offered ?? 0);
    const seatsSold = Number(sales.sold ?? 0);

    return {
      routeId: r.route_id as string,
      code: r.code as string,
      name: r.name as string,
      corridor: r.corridor as string,
      departures: Number(r.departures ?? 0),
      running: Number(r.running ?? 0),
      cancelled: Number(r.cancelled ?? 0),
      seatsOffered,
      seatsSold,
      loadPct: seatsOffered === 0 ? 0 : Math.round((seatsSold / seatsOffered) * 100),
      revenueKes: Number(sales.revenue ?? 0),
      worstDelayMinutes: Number(r.worst_delay ?? 0),
    };
  });
}

/* ------------------------------------------------------------------ *
 * Controlling a departure
 * ------------------------------------------------------------------ */

export class OpsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpsError";
  }
}

/**
 * Cancels a departure and releases every seat on it.
 *
 * Riders are not silently stranded: their bookings come back as cancelled, so
 * the seat is off their account and the trip drops out of their upcoming list.
 */
export function cancelTrip(tripId: string, reason: string): number {
  return tx((conn) => {
    const trip = conn.prepare("SELECT status FROM trips WHERE id = ?").get(tripId) as
      | Row
      | undefined;
    if (!trip) throw new OpsError("That departure no longer exists.");
    if (trip.status === "completed") {
      throw new OpsError("That departure has already run and cannot be cancelled.");
    }

    conn
      .prepare("UPDATE trips SET status = 'cancelled', cancel_reason = ? WHERE id = ?")
      .run(reason.trim() || "Cancelled by control", tripId);

    const released = conn
      .prepare(
        "UPDATE bookings SET status = 'cancelled' WHERE trip_id = ? AND status IN ('booked','boarded')",
      )
      .run(tripId);

    return released.changes;
  });
}

/** Puts a cancelled departure back on the board. Released seats stay released. */
export function reinstateTrip(tripId: string): void {
  db()
    .prepare(
      "UPDATE trips SET status = 'scheduled', cancel_reason = NULL WHERE id = ? AND status = 'cancelled'",
    )
    .run(tripId);
}

/**
 * Swaps the bus on a departure.
 *
 * A smaller replacement cannot be allowed to strand riders who already hold a
 * seat, so the swap is refused rather than silently overselling — control can
 * pick a bigger unit or cancel deliberately.
 */
export function reassignVehicle(tripId: string, vehicleId: string): void {
  tx((conn) => {
    const vehicle = conn.prepare("SELECT capacity FROM vehicles WHERE id = ?").get(vehicleId) as
      | Row
      | undefined;
    if (!vehicle) throw new OpsError("That vehicle is not in the fleet.");

    const sold = (
      conn
        .prepare(
          "SELECT COUNT(*) AS n FROM bookings WHERE trip_id = ? AND status IN ('booked','boarded')",
        )
        .get(tripId) as Row
    ).n as number;

    const capacity = vehicle.capacity as number;
    if (capacity < sold) {
      throw new OpsError(
        `That bus seats ${capacity} but ${sold} seats are already sold on this departure.`,
      );
    }

    const highestSeat = (
      conn
        .prepare(
          "SELECT COALESCE(MAX(seat_no), 0) AS n FROM bookings WHERE trip_id = ? AND status IN ('booked','boarded')",
        )
        .get(tripId) as Row
    ).n as number;
    if (highestSeat > capacity) {
      throw new OpsError(
        `Seat ${highestSeat} is sold on this departure and does not exist on that bus.`,
      );
    }

    conn
      .prepare("UPDATE trips SET vehicle_id = ?, capacity = ? WHERE id = ?")
      .run(vehicleId, capacity, tripId);
  });
}

export function reassignDriver(tripId: string, driverId: string): void {
  const driver = db().prepare("SELECT id FROM drivers WHERE id = ? AND active = 1").get(driverId);
  if (!driver) throw new OpsError("That driver is not on the active roster.");
  db().prepare("UPDATE trips SET driver_id = ? WHERE id = ?").run(driverId, tripId);
}

export function setTripDelay(tripId: string, delayMinutes: number): void {
  const minutes = Math.max(0, Math.min(240, Math.round(delayMinutes)));
  db().prepare("UPDATE trips SET delay_minutes = ? WHERE id = ?").run(minutes, tripId);
}

export function setTripStatus(tripId: string, status: Trip["status"]): void {
  db().prepare("UPDATE trips SET status = ? WHERE id = ?").run(status, tripId);
}

/* ------------------------------------------------------------------ *
 * Stage arrivals
 * ------------------------------------------------------------------ */

export interface StopEvent {
  stopId: string;
  arrivedAt: string;
}

export function tripStopEvents(tripId: string): StopEvent[] {
  return (
    db()
      .prepare("SELECT stop_id, arrived_at FROM trip_stop_events WHERE trip_id = ? ORDER BY arrived_at")
      .all(tripId) as Row[]
  ).map((r) => ({ stopId: r.stop_id as string, arrivedAt: r.arrived_at as string }));
}

/**
 * The driver calls a stage as they reach it.
 *
 * The recorded time is compared against the plan to keep the run's delay
 * honest without the driver having to type a number: arriving nine minutes
 * after the scheduled time simply is a nine-minute delay.
 */
export function markStopArrived(tripId: string, stopId: string): { delayMinutes: number } | null {
  const summary = getTrip(tripId);
  if (!summary) return null;

  const entry = summary.timetable.find((s) => s.id === stopId);
  if (!entry) return null;

  const now = new Date();
  db()
    .prepare(
      `INSERT INTO trip_stop_events (trip_id, stop_id, arrived_at) VALUES (?, ?, ?)
       ON CONFLICT (trip_id, stop_id) DO UPDATE SET arrived_at = excluded.arrived_at`,
    )
    .run(tripId, stopId, now.toISOString());

  // Only a run that has actually left can tell us anything about its timing.
  // Calling a stage on a departure that has not started — a driver tapping
  // ahead, or control tidying up — must not quietly erase a delay somebody
  // reported for it.
  if (now.getTime() < summary.departsAt.getTime()) {
    return { delayMinutes: summary.trip.delayMinutes };
  }

  // `entry.adjustedMin` already includes any delay recorded so far, so the
  // difference here is the *additional* slip since the last stage was called.
  const expectedAt = summary.departsAt.getTime() + entry.adjustedMin * 60000;
  const slipMinutes = Math.round((now.getTime() - expectedAt) / 60000);
  const delayMinutes = Math.max(0, summary.trip.delayMinutes + slipMinutes);

  if (delayMinutes !== summary.trip.delayMinutes) setTripDelay(tripId, delayMinutes);
  return { delayMinutes };
}

/* ------------------------------------------------------------------ *
 * Incidents
 * ------------------------------------------------------------------ */

export function raiseIncident(input: {
  tripId: string;
  reporterKind: "driver" | "operator";
  reporterId: string;
  kind: IncidentKind;
  note: string;
  delayMinutes: number;
}): string {
  const id = `inc_${crypto.randomUUID().slice(0, 10)}`;
  const delay = Math.max(0, Math.min(240, Math.round(input.delayMinutes)));

  tx((conn) => {
    conn
      .prepare(
        `INSERT INTO incidents
           (id, trip_id, reporter_kind, reporter_id, kind, note, delay_minutes, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.tripId,
        input.reporterKind,
        input.reporterId,
        input.kind,
        input.note.trim(),
        delay,
        new Date().toISOString(),
      );

    // A reported delay is additive: two incidents on one run compound.
    if (delay > 0) {
      conn
        .prepare(
          "UPDATE trips SET delay_minutes = MIN(240, delay_minutes + ?) WHERE id = ?",
        )
        .run(delay, input.tripId);
    }
  });

  return id;
}

export function resolveIncident(incidentId: string): void {
  db()
    .prepare("UPDATE incidents SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL")
    .run(new Date().toISOString(), incidentId);
}

export interface IncidentView {
  incident: Incident;
  trip: TripSummary | null;
  reporterName: string;
}

export function listIncidents(opts: { openOnly?: boolean; limit?: number } = {}): IncidentView[] {
  const clauses = opts.openOnly ? ["i.resolved_at IS NULL"] : [];
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  return (
    db()
      .prepare(
        `SELECT i.*,
                COALESCE(d.name, o.name, 'Unknown') AS reporter_name
           FROM incidents i
           LEFT JOIN drivers d ON d.id = i.reporter_id AND i.reporter_kind = 'driver'
           LEFT JOIN operators o ON o.id = i.reporter_id AND i.reporter_kind = 'operator'
           ${where}
          ORDER BY i.created_at DESC
          LIMIT ?`,
      )
      .all(opts.limit ?? 40) as Row[]
  ).map((r) => ({
    incident: toIncident(r),
    trip: getTrip(r.trip_id as string),
    reporterName: r.reporter_name as string,
  }));
}

export function tripIncidents(tripId: string): Incident[] {
  return (
    db()
      .prepare("SELECT * FROM incidents WHERE trip_id = ? ORDER BY created_at DESC")
      .all(tripId) as Row[]
  ).map(toIncident);
}

/* ------------------------------------------------------------------ *
 * Driver's own day
 * ------------------------------------------------------------------ */

export function driverRuns(driverId: string, serviceDate: string): TripSummary[] {
  return listTrips({ serviceDate, driverId, includeCancelled: true }).sort(
    (a, b) => a.departsAt.getTime() - b.departsAt.getTime(),
  );
}

export interface DriverStats {
  runsThisMonth: number;
  ridersCarried: number;
  onTimePct: number;
}

export function driverStats(driverId: string, from: string, to: string): DriverStats {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS runs,
              COUNT(*) FILTER (WHERE delay_minutes <= 5) AS on_time
         FROM trips
        WHERE driver_id = ? AND status = 'completed' AND service_date BETWEEN ? AND ?`,
    )
    .get(driverId, from, to) as Row;

  const riders = db()
    .prepare(
      `SELECT COUNT(*) AS n FROM bookings b
         JOIN trips t ON t.id = b.trip_id
        WHERE t.driver_id = ? AND b.status = 'boarded' AND t.service_date BETWEEN ? AND ?`,
    )
    .get(driverId, from, to) as Row;

  const runs = Number(row.runs ?? 0);
  return {
    runsThisMonth: runs,
    ridersCarried: Number(riders.n ?? 0),
    onTimePct: runs === 0 ? 0 : Math.round((Number(row.on_time ?? 0) / runs) * 100),
  };
}

/* ------------------------------------------------------------------ *
 * Client administration
 * ------------------------------------------------------------------ */

export class PeopleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeopleError";
  }
}

export function createEmployee(input: {
  companyId: string;
  name: string;
  email: string;
  phone: string;
  staffNo: string;
  homeStopId: string | null;
  workStopId: string | null;
  role: "employee" | "admin";
}): string {
  const company = db().prepare("SELECT email_domain FROM companies WHERE id = ?").get(input.companyId) as
    | Row
    | undefined;
  if (!company) throw new PeopleError("Company not found.");

  const email = input.email.trim().toLowerCase();
  const domain = (company.email_domain as string).toLowerCase();
  if (!email.endsWith(`@${domain}`)) {
    throw new PeopleError(`Work emails on this account must end in @${domain}.`);
  }

  const clash = db().prepare("SELECT id FROM employees WHERE lower(email) = ?").get(email);
  if (clash) throw new PeopleError("Someone with that work email is already on the account.");

  const id = `emp_${crypto.randomUUID().slice(0, 10)}`;
  db()
    .prepare(
      `INSERT INTO employees
         (id, company_id, name, email, phone, staff_no, home_stop_id, work_stop_id, role, active, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,1,?)`,
    )
    .run(
      id,
      input.companyId,
      input.name.trim(),
      email,
      input.phone.trim(),
      input.staffNo.trim(),
      input.homeStopId,
      input.workStopId,
      input.role,
      new Date().toISOString(),
    );
  return id;
}

export function updateEmployee(
  employeeId: string,
  companyId: string,
  patch: {
    homeStopId?: string | null;
    workStopId?: string | null;
    role?: "employee" | "admin";
    phone?: string;
  },
): void {
  const employee = db()
    .prepare("SELECT * FROM employees WHERE id = ? AND company_id = ?")
    .get(employeeId, companyId) as Row | undefined;
  if (!employee) throw new PeopleError("That employee is not on your account.");

  db()
    .prepare(
      `UPDATE employees
          SET home_stop_id = ?, work_stop_id = ?, role = ?, phone = ?
        WHERE id = ? AND company_id = ?`,
    )
    .run(
      patch.homeStopId === undefined ? employee.home_stop_id : patch.homeStopId,
      patch.workStopId === undefined ? employee.work_stop_id : patch.workStopId,
      patch.role ?? employee.role,
      patch.phone?.trim() || employee.phone,
      employeeId,
      companyId,
    );
}

/**
 * Deactivating a rider also releases seats they hold on departures that have
 * not run yet — leaving those seats reserved for someone who has left the
 * company would quietly shrink the bus.
 */
export function setEmployeeActive(
  employeeId: string,
  companyId: string,
  active: boolean,
): { releasedSeats: number } {
  return tx((conn) => {
    const employee = conn
      .prepare("SELECT id FROM employees WHERE id = ? AND company_id = ?")
      .get(employeeId, companyId) as Row | undefined;
    if (!employee) throw new PeopleError("That employee is not on your account.");

    conn.prepare("UPDATE employees SET active = ? WHERE id = ?").run(active ? 1 : 0, employeeId);
    if (active) return { releasedSeats: 0 };

    const today = nairobiDate();
    const released = conn
      .prepare(
        `UPDATE bookings SET status = 'cancelled'
          WHERE employee_id = ? AND status = 'booked'
            AND trip_id IN (SELECT id FROM trips WHERE service_date >= ?)`,
      )
      .run(employeeId, today);

    return { releasedSeats: released.changes };
  });
}

export function updateCompanyPolicy(
  companyId: string,
  patch: { subsidyBps: number; monthlyCapKes: number; billingEmail: string },
): void {
  if (patch.subsidyBps < 0 || patch.subsidyBps > 10000) {
    throw new PeopleError("The employer share must be between 0% and 100%.");
  }
  if (patch.monthlyCapKes < 0) {
    throw new PeopleError("A monthly cap cannot be negative.");
  }

  db()
    .prepare(
      "UPDATE companies SET subsidy_bps = ?, monthly_cap_kes = ?, billing_email = ? WHERE id = ?",
    )
    .run(patch.subsidyBps, patch.monthlyCapKes, patch.billingEmail.trim(), companyId);
}

export function updateCompanyContract(
  companyId: string,
  patch: { subsidyBps: number; monthlyCapKes: number },
): void {
  db()
    .prepare("UPDATE companies SET subsidy_bps = ?, monthly_cap_kes = ? WHERE id = ?")
    .run(patch.subsidyBps, patch.monthlyCapKes, companyId);
}

/* ------------------------------------------------------------------ *
 * Invoicing
 * ------------------------------------------------------------------ */

export interface InvoiceLine {
  employeeId: string;
  name: string;
  staffNo: string;
  trips: number;
  employerKes: number;
  employeeKes: number;
}

export interface Invoice {
  company: Company;
  /** YYYY-MM */
  month: string;
  from: string;
  to: string;
  lines: InvoiceLine[];
  employerTotalKes: number;
  employeeTotalKes: number;
  trips: number;
  /** Road passenger transport is VAT-exempt in Kenya, so this is always zero. */
  vatKes: number;
}

export function monthlyInvoice(companyId: string, month: string): Invoice | null {
  const companyRow = db().prepare("SELECT * FROM companies WHERE id = ?").get(companyId) as
    | Row
    | undefined;
  if (!companyRow) return null;

  const company: Company = {
    id: companyRow.id as string,
    name: companyRow.name as string,
    emailDomain: companyRow.email_domain as string,
    billingEmail: companyRow.billing_email as string,
    kraPin: companyRow.kra_pin as string,
    subsidyBps: companyRow.subsidy_bps as number,
    monthlyCapKes: companyRow.monthly_cap_kes as number,
  };

  const lines = (
    db()
      .prepare(
        `SELECT e.id AS employee_id, e.name, e.staff_no,
                COUNT(b.id) AS trips,
                COALESCE(SUM(b.employer_kes), 0) AS employer_kes,
                COALESCE(SUM(b.employee_kes), 0) AS employee_kes
           FROM bookings b
           JOIN trips t ON t.id = b.trip_id
           JOIN employees e ON e.id = b.employee_id
          WHERE e.company_id = ?
            AND substr(t.service_date, 1, 7) = ?
            AND b.status IN ('boarded','no_show')
          GROUP BY e.id
          ORDER BY employer_kes DESC, e.name`,
      )
      .all(companyId, month) as Row[]
  ).map((r) => ({
    employeeId: r.employee_id as string,
    name: r.name as string,
    staffNo: r.staff_no as string,
    trips: Number(r.trips ?? 0),
    employerKes: Number(r.employer_kes ?? 0),
    employeeKes: Number(r.employee_kes ?? 0),
  }));

  return {
    company,
    month,
    from: `${month}-01`,
    to: `${month}-31`,
    lines,
    employerTotalKes: lines.reduce((sum, l) => sum + l.employerKes, 0),
    employeeTotalKes: lines.reduce((sum, l) => sum + l.employeeKes, 0),
    trips: lines.reduce((sum, l) => sum + l.trips, 0),
    vatKes: 0,
  };
}

/* ------------------------------------------------------------------ *
 * Network revenue
 * ------------------------------------------------------------------ */

export interface ClientRevenue {
  company: Company;
  headcount: number;
  activeRiders: number;
  trips: number;
  revenueKes: number;
}

export function clientRevenue(from: string, to: string): ClientRevenue[] {
  return (
    db()
      .prepare(
        `SELECT c.*,
                (SELECT COUNT(*) FROM employees e2 WHERE e2.company_id = c.id AND e2.active = 1) AS headcount,
                COUNT(DISTINCT b.employee_id) AS riders,
                COUNT(b.id) AS trips,
                COALESCE(SUM(b.fare_kes), 0) AS revenue
           FROM companies c
           LEFT JOIN employees e ON e.company_id = c.id
           LEFT JOIN bookings b
             ON b.employee_id = e.id AND b.status IN ('booked','boarded')
           LEFT JOIN trips t
             ON t.id = b.trip_id AND t.service_date BETWEEN ? AND ?
          WHERE b.id IS NULL OR t.id IS NOT NULL
          GROUP BY c.id
          ORDER BY revenue DESC`,
      )
      .all(from, to) as Row[]
  ).map((r) => ({
    company: {
      id: r.id as string,
      name: r.name as string,
      emailDomain: r.email_domain as string,
      billingEmail: r.billing_email as string,
      kraPin: r.kra_pin as string,
      subsidyBps: r.subsidy_bps as number,
      monthlyCapKes: r.monthly_cap_kes as number,
    },
    headcount: Number(r.headcount ?? 0),
    activeRiders: Number(r.riders ?? 0),
    trips: Number(r.trips ?? 0),
    revenueKes: Number(r.revenue ?? 0),
  }));
}

export function dailyNetworkRevenue(
  from: string,
  to: string,
): { date: string; kes: number; trips: number }[] {
  return (
    db()
      .prepare(
        `SELECT t.service_date AS date,
                COALESCE(SUM(b.fare_kes), 0) AS kes,
                COUNT(b.id) AS trips
           FROM bookings b
           JOIN trips t ON t.id = b.trip_id
          WHERE b.status IN ('booked','boarded') AND t.service_date BETWEEN ? AND ?
          GROUP BY t.service_date
          ORDER BY t.service_date`,
      )
      .all(from, to) as Row[]
  ).map((r) => ({
    date: r.date as string,
    kes: Number(r.kes ?? 0),
    trips: Number(r.trips ?? 0),
  }));
}

/* ------------------------------------------------------------------ *
 * Network editing
 * ------------------------------------------------------------------ */

export function setRouteActive(routeId: string, active: boolean): void {
  db().prepare("UPDATE routes SET active = ? WHERE id = ?").run(active ? 1 : 0, routeId);
}

export function listAllRoutes(): { id: string; code: string; name: string; slug: string; corridor: string; active: number; stops: number }[] {
  return (
    db()
      .prepare(
        `SELECT r.*, (SELECT COUNT(*) FROM route_stops rs WHERE rs.route_id = r.id) AS stops
           FROM routes r ORDER BY r.code`,
      )
      .all() as Row[]
  ).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    slug: r.slug as string,
    corridor: r.corridor as string,
    active: r.active as number,
    stops: Number(r.stops ?? 0),
  }));
}

export function createStop(input: {
  name: string;
  area: string;
  landmark: string;
  lat: number;
  lng: number;
}): string {
  const slug = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const id = `stp_${slug}-${crypto.randomUUID().slice(0, 4)}`;
  db()
    .prepare("INSERT INTO stops (id, name, slug, area, landmark, lat, lng) VALUES (?,?,?,?,?,?,?)")
    .run(id, input.name.trim(), `${slug}-${id.slice(-4)}`, input.area.trim(), input.landmark.trim(), input.lat, input.lng);
  return id;
}
