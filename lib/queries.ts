import { record, type Actor } from "@/lib/audit";
import { db, tx } from "@/lib/db";
import { fareForKm, splitFare, type FareSplit } from "@/lib/domain/fares";
import {
  buildTimetable,
  legKm,
  orderedStops,
  peakFactor,
  type TimetableEntry,
} from "@/lib/domain/schedule";
import { generatePassCode, nextFreeSeat, TripFullError } from "@/lib/domain/seats";
import { nairobiInstant } from "@/lib/domain/time";
import type {
  Booking,
  Company,
  Direction,
  Driver,
  Employee,
  Incident,
  Operator,
  Route,
  RouteStop,
  Stop,
  Trip,
  Vehicle,
} from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Row mapping
 * ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

const toStop = (r: Row): Stop => ({
  id: r.id as string,
  name: r.name as string,
  slug: r.slug as string,
  area: r.area as string,
  landmark: r.landmark as string,
  lat: r.lat as number,
  lng: r.lng as number,
});

const toRouteStop = (r: Row): RouteStop => ({
  ...toStop(r),
  seq: r.seq as number,
  kmFromStart: r.km_from_start as number,
  minFromStart: r.min_from_start as number,
});

const toRoute = (r: Row): Route => ({
  id: r.id as string,
  code: r.code as string,
  name: r.name as string,
  slug: r.slug as string,
  corridor: r.corridor as string,
  blurb: r.blurb as string,
  active: r.active as number,
});

const toTrip = (r: Row): Trip => ({
  id: r.id as string,
  routeId: r.route_id as string,
  direction: r.direction as Direction,
  serviceDate: r.service_date as string,
  departTime: r.depart_time as string,
  vehicleId: r.vehicle_id as string,
  driverId: r.driver_id as string,
  capacity: r.capacity as number,
  status: r.status as Trip["status"],
  delayMinutes: (r.delay_minutes as number) ?? 0,
  cancelReason: (r.cancel_reason as string) ?? null,
});

const toBooking = (r: Row): Booking => ({
  id: r.id as string,
  tripId: r.trip_id as string,
  employeeId: r.employee_id as string,
  boardStopId: r.board_stop_id as string,
  alightStopId: r.alight_stop_id as string,
  seatNo: r.seat_no as number,
  fareKes: r.fare_kes as number,
  employerKes: r.employer_kes as number,
  employeeKes: r.employee_kes as number,
  passCode: r.pass_code as string,
  status: r.status as Booking["status"],
  createdAt: r.created_at as string,
  boardedAt: (r.boarded_at as string) ?? null,
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

const toCompany = (r: Row): Company => ({
  id: r.id as string,
  name: r.name as string,
  emailDomain: r.email_domain as string,
  billingEmail: r.billing_email as string,
  kraPin: r.kra_pin as string,
  subsidyBps: r.subsidy_bps as number,
  monthlyCapKes: r.monthly_cap_kes as number,
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

const toDriver = (r: Row): Driver => ({
  id: r.id as string,
  name: r.name as string,
  phone: r.phone as string,
  psvLicence: r.psv_licence as string,
  ratingBps: r.rating_bps as number,
  email: (r.email as string) ?? null,
  active: (r.active as number) ?? 1,
});

const toOperator = (r: Row): Operator => ({
  id: r.id as string,
  name: r.name as string,
  email: r.email as string,
  phone: r.phone as string,
  role: r.role as Operator["role"],
  active: r.active as number,
});

const toIncident = (r: Row): Incident => ({
  id: r.id as string,
  tripId: r.trip_id as string,
  reporterKind: r.reporter_kind as Incident["reporterKind"],
  reporterId: r.reporter_id as string,
  kind: r.kind as Incident["kind"],
  note: r.note as string,
  delayMinutes: r.delay_minutes as number,
  createdAt: r.created_at as string,
  resolvedAt: (r.resolved_at as string) ?? null,
});

/* ------------------------------------------------------------------ *
 * Reference data
 * ------------------------------------------------------------------ */

export function listStops(): Stop[] {
  return db().prepare("SELECT * FROM stops ORDER BY area, name").all().map((r) => toStop(r as Row));
}

export function listRoutes(): Route[] {
  return db()
    .prepare("SELECT * FROM routes WHERE active = 1 ORDER BY code")
    .all()
    .map((r) => toRoute(r as Row));
}

export function getRouteBySlug(slug: string): Route | null {
  const row = db().prepare("SELECT * FROM routes WHERE slug = ?").get(slug) as Row | undefined;
  return row ? toRoute(row) : null;
}

export function getRoute(id: string): Route | null {
  const row = db().prepare("SELECT * FROM routes WHERE id = ?").get(id) as Row | undefined;
  return row ? toRoute(row) : null;
}

/** Route stops in stored (inbound) order. */
export function getRouteStops(routeId: string): RouteStop[] {
  return db()
    .prepare(
      `SELECT s.*, rs.seq, rs.km_from_start, rs.min_from_start
         FROM route_stops rs
         JOIN stops s ON s.id = rs.stop_id
        WHERE rs.route_id = ?
        ORDER BY rs.seq`,
    )
    .all(routeId)
    .map((r) => toRouteStop(r as Row));
}

/** Route stops in travel order for a direction, rebased on that direction's origin. */
export function getDirectionalStops(routeId: string, direction: Direction): RouteStop[] {
  return orderedStops(getRouteStops(routeId), direction);
}

export function getCompany(id: string): Company | null {
  const row = db().prepare("SELECT * FROM companies WHERE id = ?").get(id) as Row | undefined;
  return row ? toCompany(row) : null;
}

export function listCompanies(): Company[] {
  return db().prepare("SELECT * FROM companies ORDER BY name").all().map((r) => toCompany(r as Row));
}

export function getEmployeeByEmail(email: string): Employee | null {
  const row = db()
    .prepare("SELECT * FROM employees WHERE lower(email) = lower(?) AND active = 1")
    .get(email.trim()) as Row | undefined;
  return row ? toEmployee(row) : null;
}

export function getEmployee(id: string): Employee | null {
  const row = db().prepare("SELECT * FROM employees WHERE id = ?").get(id) as Row | undefined;
  return row ? toEmployee(row) : null;
}

export function listEmployees(companyId: string): Employee[] {
  return db()
    .prepare("SELECT * FROM employees WHERE company_id = ? ORDER BY name")
    .all(companyId)
    .map((r) => toEmployee(r as Row));
}

/* ------------------------------------------------------------------ *
 * Trips
 * ------------------------------------------------------------------ */

export interface TripSummary {
  trip: Trip;
  route: Route;
  vehicle: Vehicle;
  driver: Driver;
  timetable: TimetableEntry[];
  departsAt: Date;
  arrivesAt: Date;
  seatsBooked: number;
  seatsAvailable: number;
  peakFactor: number;
}

function hydrateTrip(row: Row): TripSummary {
  const trip = toTrip(row);
  const route = toRoute({
    id: row.route_id,
    code: row.route_code,
    name: row.route_name,
    slug: row.route_slug,
    corridor: row.route_corridor,
    blurb: row.route_blurb,
    active: 1,
  });
  const vehicle = toVehicle({
    id: row.vehicle_id,
    plate: row.plate,
    model: row.model,
    capacity: row.vehicle_capacity,
    wifi: row.wifi,
    usb_ports: row.usb_ports,
    operator: row.operator,
  });
  const driver = toDriver({
    id: row.driver_id,
    name: row.driver_name,
    phone: row.driver_phone,
    psv_licence: row.psv_licence,
    rating_bps: row.rating_bps,
    email: row.driver_email,
    active: row.driver_active,
  });

  const stops = getDirectionalStops(trip.routeId, trip.direction);
  const timetable = buildTimetable(stops, trip.departTime, trip.delayMinutes);
  const departsAt = nairobiInstant(trip.serviceDate, trip.departTime);
  const last = timetable[timetable.length - 1];
  const seatsBooked = Number(row.seats_booked ?? 0);

  return {
    trip,
    route,
    vehicle,
    driver,
    timetable,
    departsAt,
    arrivesAt: new Date(departsAt.getTime() + last.adjustedMin * 60000),
    seatsBooked,
    seatsAvailable: Math.max(0, trip.capacity - seatsBooked),
    peakFactor: peakFactor(trip.departTime),
  };
}

const TRIP_SELECT = `
  SELECT t.*,
         r.code AS route_code, r.name AS route_name, r.slug AS route_slug,
         r.corridor AS route_corridor, r.blurb AS route_blurb,
         v.plate, v.model, v.capacity AS vehicle_capacity, v.wifi, v.usb_ports, v.operator,
         d.name AS driver_name, d.phone AS driver_phone, d.psv_licence, d.rating_bps,
         d.email AS driver_email, d.active AS driver_active,
         (SELECT COUNT(*) FROM bookings b
           WHERE b.trip_id = t.id AND b.status IN ('booked','boarded')) AS seats_booked
    FROM trips t
    JOIN routes r ON r.id = t.route_id
    JOIN vehicles v ON v.id = t.vehicle_id
    JOIN drivers d ON d.id = t.driver_id
`;

export function getTrip(id: string): TripSummary | null {
  const row = db().prepare(`${TRIP_SELECT} WHERE t.id = ?`).get(id) as Row | undefined;
  return row ? hydrateTrip(row) : null;
}

export interface TripFilter {
  serviceDate: string;
  direction?: Direction;
  routeId?: string;
  /** Only departures that call at this stop. */
  stopId?: string;
  status?: Trip["status"];
  /** Operations views need to see cancelled departures; rider views do not. */
  includeCancelled?: boolean;
  driverId?: string;
}

export function listTrips(filter: TripFilter): TripSummary[] {
  const clauses = ["t.service_date = ?"];
  if (!filter.includeCancelled) clauses.push("t.status != 'cancelled'");
  const params: unknown[] = [filter.serviceDate];

  if (filter.direction) {
    clauses.push("t.direction = ?");
    params.push(filter.direction);
  }
  if (filter.routeId) {
    clauses.push("t.route_id = ?");
    params.push(filter.routeId);
  }
  if (filter.stopId) {
    clauses.push(
      "EXISTS (SELECT 1 FROM route_stops rs WHERE rs.route_id = t.route_id AND rs.stop_id = ?)",
    );
    params.push(filter.stopId);
  }
  if (filter.status) {
    clauses.push("t.status = ?");
    params.push(filter.status);
  }
  if (filter.driverId) {
    clauses.push("t.driver_id = ?");
    params.push(filter.driverId);
  }

  return db()
    .prepare(`${TRIP_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY t.depart_time, r.code`)
    .all(...params)
    .map((r) => hydrateTrip(r as Row));
}

export interface CommuteMatch {
  route: Route;
  direction: Direction;
  boardStopId: string;
  alightStopId: string;
  km: number;
}

/**
 * Every line that will carry someone from one stop to another, in either
 * direction. A pair can match twice — the morning run and the evening run are
 * the same line walked opposite ways.
 */
export function commuteMatches(fromStopId: string, toStopId: string): CommuteMatch[] {
  if (fromStopId === toStopId) return [];
  const matches: CommuteMatch[] = [];

  for (const route of listRoutes()) {
    const stops = getRouteStops(route.id);
    const from = stops.find((s) => s.id === fromStopId);
    const to = stops.find((s) => s.id === toStopId);
    if (!from || !to) continue;

    const direction: Direction = from.seq < to.seq ? "inbound" : "outbound";
    const ordered = orderedStops(stops, direction);
    matches.push({
      route,
      direction,
      boardStopId: fromStopId,
      alightStopId: toStopId,
      km: legKm(ordered, fromStopId, toStopId),
    });
  }

  return matches;
}

export function takenSeats(tripId: string): number[] {
  return db()
    .prepare(
      "SELECT seat_no FROM bookings WHERE trip_id = ? AND status IN ('booked','boarded') ORDER BY seat_no",
    )
    .all(tripId)
    .map((r) => (r as Row).seat_no as number);
}

/* ------------------------------------------------------------------ *
 * Booking
 * ------------------------------------------------------------------ */

export class BookingError extends Error {
  constructor(
    message: string,
    readonly code:
      | "trip_not_found"
      | "trip_closed"
      | "invalid_stops"
      | "seat_taken"
      | "trip_full"
      | "already_booked",
  ) {
    super(message);
    this.name = "BookingError";
  }
}

export interface BookingRequest {
  tripId: string;
  employeeId: string;
  boardStopId: string;
  alightStopId: string;
  /** Omit to be given the lowest free seat. */
  seatNo?: number;
}

export interface BookingResult {
  booking: Booking;
  split: FareSplit;
  trip: TripSummary;
}

/** Employer spend on one employee so far this calendar month, in KES. */
export function employerSpendThisMonth(employeeId: string, serviceDate: string): number {
  const month = serviceDate.slice(0, 7);
  const row = db()
    .prepare(
      `SELECT COALESCE(SUM(b.employer_kes), 0) AS total
         FROM bookings b
         JOIN trips t ON t.id = b.trip_id
        WHERE b.employee_id = ?
          AND b.status IN ('booked','boarded')
          AND substr(t.service_date, 1, 7) = ?`,
    )
    .get(employeeId, month) as Row;
  return Number(row.total ?? 0);
}

export function createBooking(req: BookingRequest): BookingResult {
  const trip = getTrip(req.tripId);
  if (!trip) throw new BookingError("Departure not found", "trip_not_found");
  if (trip.trip.status === "cancelled" || trip.trip.status === "completed") {
    throw new BookingError("This departure is no longer taking bookings", "trip_closed");
  }

  const employee = getEmployee(req.employeeId);
  if (!employee) throw new BookingError("Employee not found", "trip_not_found");
  const company = getCompany(employee.companyId);
  if (!company) throw new BookingError("Company not found", "trip_not_found");

  let km: number;
  try {
    km = legKm(trip.timetable, req.boardStopId, req.alightStopId);
  } catch (err) {
    throw new BookingError((err as Error).message, "invalid_stops");
  }

  const fareKes = fareForKm(km);
  const split = splitFare({
    fareKes,
    subsidyBps: company.subsidyBps,
    monthlyCapKes: company.monthlyCapKes,
    monthToDateKes: employerSpendThisMonth(employee.id, trip.trip.serviceDate),
  });

  const booking = tx((conn) => {
    const taken = takenSeats(req.tripId);
    if (taken.length >= trip.trip.capacity) throw new BookingError("Departure is full", "trip_full");

    let seatNo: number;
    if (req.seatNo === undefined) {
      seatNo = nextFreeSeat(trip.trip.capacity, taken);
    } else {
      if (
        !Number.isInteger(req.seatNo) ||
        req.seatNo < 1 ||
        req.seatNo > trip.trip.capacity
      ) {
        throw new BookingError("That seat does not exist on this bus", "seat_taken");
      }
      if (taken.includes(req.seatNo)) {
        throw new BookingError("That seat has just been taken", "seat_taken");
      }
      seatNo = req.seatNo;
    }

    const id = `bkg_${crypto.randomUUID().slice(0, 12)}`;
    const createdAt = new Date().toISOString();
    const insert = conn.prepare(
      `INSERT INTO bookings
         (id, trip_id, employee_id, board_stop_id, alight_stop_id, seat_no,
          fare_kes, employer_kes, employee_kes, pass_code, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'booked', ?)`,
    );

    // The partial unique indexes are the real guard against two riders racing
    // for the same seat, so their violations are translated here rather than
    // trusted to the pre-flight checks above. A pass-code clash is the only
    // one worth retrying.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        insert.run(
          id,
          req.tripId,
          req.employeeId,
          req.boardStopId,
          req.alightStopId,
          seatNo,
          split.fareKes,
          split.employerKes,
          split.employeeKes,
          generatePassCode(),
          createdAt,
        );
        return conn.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as Row;
      } catch (err) {
        const message = (err as Error).message;
        if (message.includes("employee_id")) {
          throw new BookingError("You already hold a seat on this departure", "already_booked");
        }
        if (message.includes("seat_no")) {
          throw new BookingError("That seat has just been taken", "seat_taken");
        }
        if (!message.includes("pass_code")) throw err;
      }
    }
    throw new Error("could not allocate a unique boarding pass code");
  });

  return { booking: toBooking(booking), split, trip };
}

export function cancelBooking(bookingId: string, employeeId: string): boolean {
  const info = db()
    .prepare(
      `UPDATE bookings SET status = 'cancelled'
        WHERE id = ? AND employee_id = ? AND status = 'booked'`,
    )
    .run(bookingId, employeeId);
  return info.changes > 0;
}

export interface BookingView {
  booking: Booking;
  trip: TripSummary;
  boardStop: TimetableEntry;
  alightStop: TimetableEntry;
  boardTime: string;
  alightTime: string;
}

function viewBooking(booking: Booking): BookingView | null {
  const trip = getTrip(booking.tripId);
  if (!trip) return null;
  const boardStop = trip.timetable.find((s) => s.id === booking.boardStopId);
  const alightStop = trip.timetable.find((s) => s.id === booking.alightStopId);
  if (!boardStop || !alightStop) return null;

  return {
    booking,
    trip,
    boardStop,
    alightStop,
    boardTime: boardStop.time,
    alightTime: alightStop.time,
  };
}

export function listBookingsForEmployee(
  employeeId: string,
  opts: { from?: string; to?: string; includeCancelled?: boolean } = {},
): BookingView[] {
  const clauses = ["b.employee_id = ?"];
  const params: unknown[] = [employeeId];

  if (!opts.includeCancelled) clauses.push("b.status != 'cancelled'");
  if (opts.from) {
    clauses.push("t.service_date >= ?");
    params.push(opts.from);
  }
  if (opts.to) {
    clauses.push("t.service_date <= ?");
    params.push(opts.to);
  }

  return db()
    .prepare(
      `SELECT b.* FROM bookings b
         JOIN trips t ON t.id = b.trip_id
        WHERE ${clauses.join(" AND ")}
        ORDER BY t.service_date DESC, t.depart_time DESC`,
    )
    .all(...params)
    .map((r) => viewBooking(toBooking(r as Row)))
    .filter((v): v is BookingView => v !== null);
}

export function getBooking(id: string): Booking | null {
  const row = db().prepare("SELECT * FROM bookings WHERE id = ?").get(id) as Row | undefined;
  return row ? toBooking(row) : null;
}

/* ------------------------------------------------------------------ *
 * Boarding (driver / conductor)
 * ------------------------------------------------------------------ */

export interface ManifestEntry {
  booking: Booking;
  employee: Employee;
  companyName: string;
  boardStop: Stop;
  alightStop: Stop;
  boardTime: string;
}

export function tripManifest(tripId: string): ManifestEntry[] {
  const trip = getTrip(tripId);
  if (!trip) return [];
  const byId = new Map(trip.timetable.map((s) => [s.id, s]));

  return db()
    .prepare(
      `SELECT b.*, e.name AS emp_name, e.email AS emp_email, e.phone AS emp_phone,
              e.staff_no AS emp_staff_no, e.company_id AS emp_company_id,
              e.home_stop_id AS emp_home, e.work_stop_id AS emp_work,
              e.role AS emp_role, e.active AS emp_active,
              c.name AS company_name
         FROM bookings b
         JOIN employees e ON e.id = b.employee_id
         JOIN companies c ON c.id = e.company_id
        WHERE b.trip_id = ? AND b.status IN ('booked','boarded')
        ORDER BY b.seat_no`,
    )
    .all(tripId)
    .map((raw) => {
      const r = raw as Row;
      const booking = toBooking(r);
      const boardStop = byId.get(booking.boardStopId)!;
      const alightStop = byId.get(booking.alightStopId)!;
      return {
        booking,
        employee: toEmployee({
          id: r.employee_id,
          company_id: r.emp_company_id,
          name: r.emp_name,
          email: r.emp_email,
          phone: r.emp_phone,
          staff_no: r.emp_staff_no,
          home_stop_id: r.emp_home,
          work_stop_id: r.emp_work,
          role: r.emp_role,
          active: r.emp_active,
        }),
        companyName: r.company_name as string,
        boardStop,
        alightStop,
        boardTime: boardStop.time,
      };
    });
}

export type BoardResult =
  | { ok: true; entry: ManifestEntry }
  | { ok: false; reason: "not_found" | "already_boarded" | "wrong_trip" };

/** Conductor scans or types a pass code at the door. */
export function boardByPassCode(tripId: string, passCode: string): BoardResult {
  const code = passCode.trim().toUpperCase();
  const row = db()
    .prepare("SELECT * FROM bookings WHERE pass_code = ?")
    .get(code) as Row | undefined;

  if (!row) return { ok: false, reason: "not_found" };
  const booking = toBooking(row);
  if (booking.tripId !== tripId) return { ok: false, reason: "wrong_trip" };
  if (booking.status === "boarded") return { ok: false, reason: "already_boarded" };
  if (booking.status !== "booked") return { ok: false, reason: "not_found" };

  db()
    .prepare("UPDATE bookings SET status = 'boarded', boarded_at = ? WHERE id = ?")
    .run(new Date().toISOString(), booking.id);

  const entry = tripManifest(tripId).find((e) => e.booking.id === booking.id);
  return entry ? { ok: true, entry } : { ok: false, reason: "not_found" };
}

/**
 * Closes out a departure: anyone who never scanned is marked a no-show.
 *
 * `actor` is optional here only so the seed can close historical runs without
 * inventing a person. Every interactive caller passes one.
 */
export function closeTrip(tripId: string, actor?: Actor): number {
  const info = db()
    .prepare("UPDATE bookings SET status = 'no_show' WHERE trip_id = ? AND status = 'booked'")
    .run(tripId);
  db().prepare("UPDATE trips SET status = 'completed' WHERE id = ?").run(tripId);

  if (actor) {
    const label = db()
      .prepare(
        `SELECT r.code, t.depart_time, t.service_date FROM trips t
           JOIN routes r ON r.id = t.route_id WHERE t.id = ?`,
      )
      .get(tripId) as Row | undefined;

    record({
      actor,
      action: "trip.close",
      subjectKind: "trip",
      subjectId: tripId,
      subjectLabel: label
        ? `${label.code as string} ${label.depart_time as string} on ${label.service_date as string}`
        : tripId,
      summary: `Closed the run. ${info.changes} ${info.changes === 1 ? "rider was" : "riders were"} marked as a no-show.`,
      detail: { noShows: info.changes },
    });
  }

  return info.changes;
}

/* ------------------------------------------------------------------ *
 * Telemetry
 * ------------------------------------------------------------------ */

export interface VehiclePing {
  lat: number;
  lng: number;
  speedKph: number;
  recordedAt: string;
}

export function latestPing(tripId: string): VehiclePing | null {
  const row = db()
    .prepare(
      "SELECT lat, lng, speed_kph, recorded_at FROM vehicle_pings WHERE trip_id = ? ORDER BY recorded_at DESC LIMIT 1",
    )
    .get(tripId) as Row | undefined;

  if (!row) return null;
  return {
    lat: row.lat as number,
    lng: row.lng as number,
    speedKph: row.speed_kph as number,
    recordedAt: row.recorded_at as string,
  };
}

export function recordPing(
  tripId: string,
  ping: { lat: number; lng: number; speedKph: number },
): void {
  db()
    .prepare(
      "INSERT INTO vehicle_pings (trip_id, lat, lng, speed_kph, recorded_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(tripId, ping.lat, ping.lng, ping.speedKph, new Date().toISOString());
}

/* ------------------------------------------------------------------ *
 * Corporate reporting
 * ------------------------------------------------------------------ */

export interface CompanyMetrics {
  company: Company;
  from: string;
  to: string;
  tripsTaken: number;
  bookings: number;
  noShows: number;
  cancellations: number;
  employerKes: number;
  employeeKes: number;
  activeRiders: number;
  headcount: number;
  /** Boarded / (boarded + no-show), in percent. */
  attendancePct: number;
  co2SavedKg: number;
}

/**
 * A private car on a Nairobi commute emits roughly 190 g of CO2 per passenger
 * kilometre; a full 45-seat coach is closer to 30 g. The 160 g gap is what we
 * report back to clients for their sustainability disclosures.
 */
const CO2_SAVED_G_PER_PAX_KM = 160;

export function companyMetrics(companyId: string, from: string, to: string): CompanyMetrics | null {
  const company = getCompany(companyId);
  if (!company) return null;

  const row = db()
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE b.status IN ('booked','boarded')) AS bookings,
         COUNT(*) FILTER (WHERE b.status = 'boarded')            AS taken,
         COUNT(*) FILTER (WHERE b.status = 'no_show')            AS no_shows,
         COUNT(*) FILTER (WHERE b.status = 'cancelled')          AS cancellations,
         COALESCE(SUM(b.employer_kes) FILTER (WHERE b.status IN ('booked','boarded')), 0) AS employer_kes,
         COALESCE(SUM(b.employee_kes) FILTER (WHERE b.status IN ('booked','boarded')), 0) AS employee_kes,
         COUNT(DISTINCT b.employee_id) FILTER (WHERE b.status IN ('booked','boarded')) AS riders
       FROM bookings b
       JOIN trips t ON t.id = b.trip_id
       JOIN employees e ON e.id = b.employee_id
      WHERE e.company_id = ? AND t.service_date BETWEEN ? AND ?`,
    )
    .get(companyId, from, to) as Row;

  const headcount = (
    db()
      .prepare("SELECT COUNT(*) AS n FROM employees WHERE company_id = ? AND active = 1")
      .get(companyId) as Row
  ).n as number;

  const kmRow = db()
    .prepare(
      `SELECT COALESCE(SUM(ABS(rs2.km_from_start - rs1.km_from_start)), 0) AS km
         FROM bookings b
         JOIN trips t ON t.id = b.trip_id
         JOIN employees e ON e.id = b.employee_id
         JOIN route_stops rs1 ON rs1.route_id = t.route_id AND rs1.stop_id = b.board_stop_id
         JOIN route_stops rs2 ON rs2.route_id = t.route_id AND rs2.stop_id = b.alight_stop_id
        WHERE e.company_id = ? AND t.service_date BETWEEN ? AND ?
          AND b.status = 'boarded'`,
    )
    .get(companyId, from, to) as Row;

  const taken = Number(row.taken ?? 0);
  const noShows = Number(row.no_shows ?? 0);
  const settled = taken + noShows;

  return {
    company,
    from,
    to,
    tripsTaken: taken,
    bookings: Number(row.bookings ?? 0),
    noShows,
    cancellations: Number(row.cancellations ?? 0),
    employerKes: Number(row.employer_kes ?? 0),
    employeeKes: Number(row.employee_kes ?? 0),
    activeRiders: Number(row.riders ?? 0),
    headcount,
    attendancePct: settled === 0 ? 0 : Math.round((taken / settled) * 100),
    co2SavedKg: Math.round((Number(kmRow.km ?? 0) * CO2_SAVED_G_PER_PAX_KM) / 1000),
  };
}

export interface RouteUsage {
  route: Route;
  bookings: number;
  seatsOffered: number;
  utilisationPct: number;
  employerKes: number;
}

export function routeUsage(companyId: string, from: string, to: string): RouteUsage[] {
  const rows = db()
    .prepare(
      `SELECT r.*,
              COUNT(b.id) FILTER (WHERE b.status IN ('booked','boarded')) AS bookings,
              COALESCE(SUM(b.employer_kes) FILTER (WHERE b.status IN ('booked','boarded')), 0) AS employer_kes
         FROM routes r
         JOIN trips t ON t.route_id = r.id
         LEFT JOIN bookings b ON b.trip_id = t.id
         LEFT JOIN employees e ON e.id = b.employee_id AND e.company_id = ?
        WHERE t.service_date BETWEEN ? AND ?
          AND (b.id IS NULL OR e.id IS NOT NULL)
        GROUP BY r.id
        ORDER BY r.code`,
    )
    .all(companyId, from, to) as Row[];

  const seatRows = db()
    .prepare(
      `SELECT route_id, COALESCE(SUM(capacity), 0) AS seats
         FROM trips WHERE service_date BETWEEN ? AND ? AND status != 'cancelled'
        GROUP BY route_id`,
    )
    .all(from, to) as Row[];
  const seatsByRoute = new Map(seatRows.map((r) => [r.route_id as string, Number(r.seats)]));

  return rows.map((r) => {
    const route = toRoute(r);
    const bookings = Number(r.bookings ?? 0);
    const seatsOffered = seatsByRoute.get(route.id) ?? 0;
    return {
      route,
      bookings,
      seatsOffered,
      utilisationPct: seatsOffered === 0 ? 0 : Math.round((bookings / seatsOffered) * 100),
      employerKes: Number(r.employer_kes ?? 0),
    };
  });
}

export interface RiderSpend {
  employee: Employee;
  trips: number;
  employerKes: number;
  employeeKes: number;
}

export function riderSpend(companyId: string, from: string, to: string): RiderSpend[] {
  return (
    db()
      .prepare(
        `SELECT e.*,
                COUNT(b.id) AS trips,
                COALESCE(SUM(b.employer_kes), 0) AS employer_kes,
                COALESCE(SUM(b.employee_kes), 0) AS employee_kes
           FROM employees e
           LEFT JOIN bookings b ON b.employee_id = e.id AND b.status IN ('booked','boarded')
           LEFT JOIN trips t ON t.id = b.trip_id AND t.service_date BETWEEN ? AND ?
          WHERE e.company_id = ? AND e.active = 1 AND (b.id IS NULL OR t.id IS NOT NULL)
          GROUP BY e.id
          ORDER BY employer_kes DESC, e.name`,
      )
      .all(from, to, companyId) as Row[]
  ).map((r) => ({
    employee: toEmployee(r),
    trips: Number(r.trips ?? 0),
    employerKes: Number(r.employer_kes ?? 0),
    employeeKes: Number(r.employee_kes ?? 0),
  }));
}

/** Daily employer spend, for the trend chart on the admin dashboard. */
export function dailySpend(companyId: string, from: string, to: string): { date: string; kes: number; trips: number }[] {
  return (
    db()
      .prepare(
        `SELECT t.service_date AS date,
                COALESCE(SUM(b.employer_kes), 0) AS kes,
                COUNT(b.id) AS trips
           FROM bookings b
           JOIN trips t ON t.id = b.trip_id
           JOIN employees e ON e.id = b.employee_id
          WHERE e.company_id = ? AND b.status IN ('booked','boarded')
            AND t.service_date BETWEEN ? AND ?
          GROUP BY t.service_date
          ORDER BY t.service_date`,
      )
      .all(companyId, from, to) as Row[]
  ).map((r) => ({
    date: r.date as string,
    kes: Number(r.kes ?? 0),
    trips: Number(r.trips ?? 0),
  }));
}

export { TripFullError };
