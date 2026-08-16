/**
 * Builds a complete, believable Nairobi network in the local database.
 *
 * Run with `npm run db:seed` (or `npm run db:reset` to start from scratch).
 * Everything is derived from a fixed PRNG seed, so two runs produce the same
 * network and screenshots stay reproducible.
 */
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import {
  buildDrivers,
  buildFleet,
  COMPANIES,
  EMPLOYEES,
  OPERATORS,
  ROUTES,
  STOPS,
  type EmployeeSeed,
} from "@/lib/data/nairobi";
import { fareForKm, splitFare } from "@/lib/domain/fares";
import { isServiceDay, orderedStops, TIMETABLE, timetableFor } from "@/lib/domain/schedule";
import { generatePassCode, nextFreeSeat, TripFullError } from "@/lib/domain/seats";
import { addDays, nairobiDate, nairobiInstant } from "@/lib/domain/time";
import type { Direction, RouteStop } from "@/lib/types";

/* -------------------------------------------------------------- *
 * Deterministic randomness
 * -------------------------------------------------------------- */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260815);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const chance = (p: number): boolean => rand() < p;

/* -------------------------------------------------------------- *
 * Tunables
 * -------------------------------------------------------------- */

const PAST_SERVICE_DAYS = 24;
const FUTURE_SERVICE_DAYS = 12;
const EMPLOYEES_PER_COMPANY = 160;

/** Where each client's staff actually report to work. */
const WORK_HUBS: Record<string, string[]> = {
  cmp_tandaza: ["upper-hill", "cbd-kencom"],
  cmp_zuri: ["westlands-sarit", "gigiri-un"],
  cmp_mara: ["upper-hill", "jkia-terminal", "cbd-kencom"],
};

/** How likely a rider is to have booked, by days out from today. */
function bookingRateForLeadTime(daysAhead: number): number {
  if (daysAhead <= 0) return 0.78; // today and the past: settled ridership
  if (daysAhead === 1) return 0.72;
  if (daysAhead === 2) return 0.55;
  if (daysAhead === 3) return 0.38;
  if (daysAhead === 4) return 0.24;
  if (daysAhead <= 6) return 0.14;
  return 0.06;
}

const FIRST_NAMES = [
  "Wanjiku", "Otieno", "Njeri", "Hassan", "Cynthia", "Victor", "Aisha", "Kelvin",
  "Brenda", "Dennis", "Mercy", "Ibrahim", "Lilian", "Collins", "Sharon", "Joseph",
  "Faith", "Timothy", "Esther", "Patrick", "Janet", "Eric", "Grace", "Samuel",
  "Purity", "Fredrick", "Wangui", "Abdi", "Naomi", "Boniface", "Yvonne", "Martin",
  "Zawadi", "Kipruto", "Sylvia", "Duncan", "Halima", "Newton", "Rehema", "Alfred",
  "Doreen", "Kennedy", "Winnie", "Justus", "Salome", "Meshack", "Christine", "Tony",
];

const SURNAMES = [
  "Kamau", "Ochieng", "Wanjala", "Mutiso", "Chepkemoi", "Njoroge", "Auma", "Kiptoo",
  "Mwangi", "Odhiambo", "Wairimu", "Yusuf", "Muthoni", "Barasa", "Nekesa", "Kariuki",
  "Wangari", "Simiyu", "Nyambura", "Kilonzo", "Wafula", "Mbugua", "Achieng", "Rotich",
  "Gitonga", "Omollo", "Waithera", "Abdalla", "Cheruiyot", "Onyango", "Maina", "Kibet",
  "Nduta", "Otieno", "Mwende", "Kirui", "Atieno", "Githinji", "Sang", "Muriithi",
];

/* -------------------------------------------------------------- *
 * Database
 * -------------------------------------------------------------- */

const DB_PATH = process.env.VAYLIRON_DB ?? path.join(process.cwd(), "data", "vayliron.db");
if (DB_PATH !== ":memory:") {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  // A WAL database is three files. Deleting only the main one and then opening
  // a fresh database next to the stale sidecars fails with a short-read I/O
  // error, so if the database is gone the write-ahead log goes with it.
  if (!fs.existsSync(DB_PATH)) {
    for (const sidecar of ["-wal", "-shm"]) {
      fs.rmSync(`${DB_PATH}${sidecar}`, { force: true });
    }
  }
}

const conn = new Database(DB_PATH);
conn.pragma("journal_mode = WAL");
conn.pragma("foreign_keys = ON");
conn.exec(fs.readFileSync(path.join(process.cwd(), "lib", "schema.sql"), "utf8"));

// Order matters: children before parents.
for (const table of [
  "audit_events",
  "incidents",
  "trip_stop_events",
  "vehicle_pings",
  "bookings",
  "trips",
  "employees",
  "companies",
  "route_stops",
  "routes",
  "stops",
  "vehicles",
  "drivers",
  "operators",
]) {
  conn.prepare(`DELETE FROM ${table}`).run();
}

const now = new Date();
const today = nairobiDate(now);
const nowIso = now.toISOString();

/* -------------------------------------------------------------- *
 * Reference data
 * -------------------------------------------------------------- */

const stopIdBySlug = new Map<string, string>();

const insertStop = conn.prepare(
  "INSERT INTO stops (id, name, slug, area, landmark, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?)",
);
for (const stop of STOPS) {
  const id = `stp_${stop.slug}`;
  insertStop.run(id, stop.name, stop.slug, stop.area, stop.landmark, stop.lat, stop.lng);
  stopIdBySlug.set(stop.slug, id);
}

const insertRoute = conn.prepare(
  "INSERT INTO routes (id, code, name, slug, corridor, blurb, active) VALUES (?, ?, ?, ?, ?, ?, 1)",
);
const insertRouteStop = conn.prepare(
  "INSERT INTO route_stops (route_id, stop_id, seq, km_from_start, min_from_start) VALUES (?, ?, ?, ?, ?)",
);

/** Inbound-order stops per route, kept in memory for booking generation. */
const routeStops = new Map<string, RouteStop[]>();

for (const route of ROUTES) {
  const routeId = `rte_${route.slug}`;
  insertRoute.run(routeId, route.code, route.name, route.slug, route.corridor, route.blurb);

  const stops: RouteStop[] = route.stops.map((rs, seq) => {
    const stopId = stopIdBySlug.get(rs.stop);
    if (!stopId) throw new Error(`route ${route.code} references unknown stop "${rs.stop}"`);
    insertRouteStop.run(routeId, stopId, seq, rs.km, rs.min);

    const meta = STOPS.find((s) => s.slug === rs.stop)!;
    return {
      id: stopId,
      name: meta.name,
      slug: meta.slug,
      area: meta.area,
      landmark: meta.landmark,
      lat: meta.lat,
      lng: meta.lng,
      seq,
      kmFromStart: rs.km,
      minFromStart: rs.min,
    };
  });

  routeStops.set(routeId, stops);
}

// One bus and one badge per route per departure slot, so the peak is coverable.
const fleetSize = ROUTES.length * TIMETABLE.inbound.length;
const fleet = buildFleet(fleetSize);
const roster = buildDrivers(fleetSize);

const insertVehicle = conn.prepare(
  "INSERT INTO vehicles (id, plate, model, capacity, wifi, usb_ports, operator) VALUES (?, ?, ?, ?, ?, ?, ?)",
);
fleet.forEach((v, i) => {
  insertVehicle.run(
    `veh_${String(i + 1).padStart(3, "0")}`,
    v.plate,
    v.model,
    v.capacity,
    v.wifi ? 1 : 0,
    v.usbPorts,
    v.operator,
  );
});

const insertDriver = conn.prepare(
  `INSERT INTO drivers (id, name, phone, psv_licence, rating_bps, email, active)
   VALUES (?, ?, ?, ?, ?, ?, 1)`,
);
const driverEmails = new Set<string>();
roster.forEach((d, i) => {
  // Drivers sign in to the driver app, so each one needs a unique work email.
  const base = d.name.toLowerCase().replace(/[^a-z]+/g, ".");
  let email = `${base}@vayliron.co.ke`;
  let suffix = 1;
  while (driverEmails.has(email)) {
    suffix += 1;
    email = `${base}${suffix}@vayliron.co.ke`;
  }
  driverEmails.add(email);

  insertDriver.run(
    `drv_${String(i + 1).padStart(3, "0")}`,
    d.name,
    d.phone,
    d.psvLicence,
    d.ratingBps,
    email,
  );
});

const insertOperator = conn.prepare(
  "INSERT INTO operators (id, name, email, phone, role, active, created_at) VALUES (?,?,?,?,?,1,?)",
);
for (const op of OPERATORS) {
  insertOperator.run(op.id, op.name, op.email, op.phone, op.role, nowIso);
}

const insertCompany = conn.prepare(
  `INSERT INTO companies (id, name, email_domain, billing_email, kra_pin, subsidy_bps, monthly_cap_kes, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);
for (const c of COMPANIES) {
  insertCompany.run(
    c.id,
    c.name,
    c.emailDomain,
    c.billingEmail,
    c.kraPin,
    c.subsidyBps,
    c.monthlyCapKes,
    nowIso,
  );
}

/* -------------------------------------------------------------- *
 * Commute options: (route, board stop, work hub) triples per company
 * -------------------------------------------------------------- */

interface CommuteOption {
  routeId: string;
  boardSlug: string;
  hubSlug: string;
}

const commuteOptions = new Map<string, CommuteOption[]>();

for (const company of COMPANIES) {
  const hubs = WORK_HUBS[company.id] ?? [];
  const options: CommuteOption[] = [];

  for (const route of ROUTES) {
    const routeId = `rte_${route.slug}`;
    const slugs = route.stops.map((s) => s.stop);
    for (const hub of hubs) {
      const hubIndex = slugs.indexOf(hub);
      if (hubIndex <= 0) continue;
      for (let i = 0; i < hubIndex; i += 1) {
        options.push({ routeId, boardSlug: slugs[i], hubSlug: hub });
      }
    }
  }

  if (options.length === 0) throw new Error(`no commute options for ${company.name}`);
  commuteOptions.set(company.id, options);
}

/* -------------------------------------------------------------- *
 * Employees
 * -------------------------------------------------------------- */

interface Rider {
  id: string;
  companyId: string;
  option: CommuteOption;
  /** How reliably this person rides — spreads bookings out realistically. */
  loyalty: number;
}

const insertEmployee = conn.prepare(
  `INSERT INTO employees
     (id, company_id, name, email, phone, staff_no, home_stop_id, work_stop_id, role, active, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
);

const riders: Rider[] = [];
const usedEmails = new Set<string>();
let employeeSeq = 0;

function addEmployee(seed: EmployeeSeed, option: CommuteOption): void {
  employeeSeq += 1;
  const id = `emp_${String(employeeSeq).padStart(4, "0")}`;
  insertEmployee.run(
    id,
    seed.companyId,
    seed.name,
    seed.email,
    seed.phone,
    seed.staffNo,
    stopIdBySlug.get(seed.homeStop) ?? null,
    stopIdBySlug.get(seed.workStop) ?? null,
    seed.role,
    nowIso,
  );
  usedEmails.add(seed.email.toLowerCase());
  riders.push({ id, companyId: seed.companyId, option, loyalty: 0.55 + rand() * 0.45 });
}

// The hand-written staff first — these are the accounts the demo signs in as.
for (const seed of EMPLOYEES) {
  const options = commuteOptions.get(seed.companyId)!;
  const exact = options.find(
    (o) => o.boardSlug === seed.homeStop && o.hubSlug === seed.workStop,
  );
  addEmployee(seed, exact ?? pick(options));
}

// …then bulk staff, so utilisation and spend figures mean something.
for (const company of COMPANIES) {
  const options = commuteOptions.get(company.id)!;
  const existing = EMPLOYEES.filter((e) => e.companyId === company.id).length;

  for (let i = existing; i < EMPLOYEES_PER_COMPANY; i += 1) {
    const first = pick(FIRST_NAMES);
    const last = pick(SURNAMES);
    let email = `${first}.${last}@${company.emailDomain}`.toLowerCase();
    let suffix = 1;
    while (usedEmails.has(email)) {
      suffix += 1;
      email = `${first}.${last}${suffix}@${company.emailDomain}`.toLowerCase();
    }

    const option = pick(options);
    addEmployee(
      {
        companyId: company.id,
        name: `${first} ${last}`,
        email,
        phone: `+2547${String(10000000 + Math.floor(rand() * 89999999))}`,
        staffNo: `${company.id.slice(4, 6).toUpperCase()}-${String(4000 + i)}`,
        homeStop: option.boardSlug,
        workStop: option.hubSlug,
        role: "employee",
      },
      option,
    );
  }
}

/* -------------------------------------------------------------- *
 * Trips
 * -------------------------------------------------------------- */

const past: string[] = [];
for (let offset = -1; past.length < PAST_SERVICE_DAYS; offset -= 1) {
  const date = addDays(today, offset);
  if (isServiceDay(date)) past.push(date);
}

const future: string[] = [];
for (let offset = 1; future.length < FUTURE_SERVICE_DAYS; offset += 1) {
  const date = addDays(today, offset);
  if (isServiceDay(date)) future.push(date);
}

const serviceDates = [
  ...past.reverse(),
  ...(isServiceDay(today) ? [today] : []),
  ...future,
];

const insertTrip = conn.prepare(
  `INSERT INTO trips (id, route_id, direction, service_date, depart_time, vehicle_id, driver_id, capacity, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

interface TripRecord {
  id: string;
  routeId: string;
  direction: Direction;
  serviceDate: string;
  departTime: string;
  capacity: number;
  status: string;
  /** Stops in travel order for this direction. */
  stops: RouteStop[];
  taken: number[];
}

const trips: TripRecord[] = [];
const tripByKey = new Map<string, TripRecord>();
let tripSeq = 0;

const seedTrips = conn.transaction(() => {
  for (const serviceDate of serviceDates) {
    for (const direction of ["inbound", "outbound"] as Direction[]) {
      timetableFor(serviceDate, direction).forEach((departTime, slot) => {
        ROUTES.forEach((route, routeIndex) => {
          const routeId = `rte_${route.slug}`;
          const stops = orderedStops(routeStops.get(routeId)!, direction);

          // Each route+slot gets its own bus for the whole day.
          const unit = slot * ROUTES.length + routeIndex;
          const vehicleId = `veh_${String((unit % fleetSize) + 1).padStart(3, "0")}`;
          const driverId = `drv_${String((unit % fleetSize) + 1).padStart(3, "0")}`;
          const capacity = fleet[unit % fleetSize].capacity;

          tripSeq += 1;
          const id = `trp_${String(tripSeq).padStart(6, "0")}`;
          const status = statusFor(serviceDate, departTime, stops);

          insertTrip.run(
            id,
            routeId,
            direction,
            serviceDate,
            departTime,
            vehicleId,
            driverId,
            capacity,
            status,
          );

          const record: TripRecord = {
            id,
            routeId,
            direction,
            serviceDate,
            departTime,
            capacity,
            status,
            stops,
            taken: [],
          };
          trips.push(record);
          tripByKey.set(`${routeId}|${direction}|${serviceDate}|${departTime}`, record);
        });
      });
    }
  }
});

function statusFor(serviceDate: string, departTime: string, stops: RouteStop[]): string {
  if (serviceDate < today) return "completed";
  if (serviceDate > today) return "scheduled";

  const departsAt = nairobiInstant(serviceDate, departTime);
  const runtimeMinutes = stops[stops.length - 1].minFromStart * 1.6;
  const minutesToDeparture = (departsAt.getTime() - now.getTime()) / 60000;

  if (minutesToDeparture > 15) return "scheduled";
  if (minutesToDeparture > 0) return "boarding";
  if (-minutesToDeparture < runtimeMinutes) return "in_transit";
  return "completed";
}

seedTrips();

/* -------------------------------------------------------------- *
 * Bookings
 * -------------------------------------------------------------- */

const insertBooking = conn.prepare(
  `INSERT INTO bookings
     (id, trip_id, employee_id, board_stop_id, alight_stop_id, seat_no,
      fare_kes, employer_kes, employee_kes, pass_code, status, created_at, boarded_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const companyById = new Map(COMPANIES.map((c) => [c.id, c]));
const usedPassCodes = new Set<string>();
/** employeeId|YYYY-MM -> employer spend so far, so the monthly cap really bites. */
const monthToDate = new Map<string, number>();
let bookingSeq = 0;
let bookingCount = 0;

function uniquePassCode(): string {
  for (let i = 0; i < 50; i += 1) {
    const code = generatePassCode(rand);
    if (!usedPassCodes.has(code)) {
      usedPassCodes.add(code);
      return code;
    }
  }
  throw new Error("exhausted boarding pass code space");
}

function book(
  trip: TripRecord,
  rider: Rider,
  boardSlug: string,
  alightSlug: string,
): void {
  const boardId = stopIdBySlug.get(boardSlug)!;
  const alightId = stopIdBySlug.get(alightSlug)!;
  const board = trip.stops.find((s) => s.id === boardId);
  const alight = trip.stops.find((s) => s.id === alightId);
  if (!board || !alight || board.seq >= alight.seq) return;

  let seatNo: number;
  try {
    seatNo = nextFreeSeat(trip.capacity, trip.taken);
  } catch (err) {
    if (err instanceof TripFullError) return; // bus is full; this rider drives today
    throw err;
  }
  trip.taken.push(seatNo);

  const company = companyById.get(rider.companyId)!;
  const monthKey = `${rider.id}|${trip.serviceDate.slice(0, 7)}`;
  const spent = monthToDate.get(monthKey) ?? 0;

  const split = splitFare({
    fareKes: fareForKm(alight.kmFromStart - board.kmFromStart),
    subsidyBps: company.subsidyBps,
    monthlyCapKes: company.monthlyCapKes,
    monthToDateKes: spent,
  });

  let status: string;
  let boardedAt: string | null = null;

  if (trip.status === "completed") {
    status = chance(0.94) ? "boarded" : "no_show";
    if (status === "boarded") {
      boardedAt = nairobiInstant(trip.serviceDate, trip.departTime).toISOString();
    }
  } else if (trip.status === "in_transit" || trip.status === "boarding") {
    status = chance(0.9) ? "boarded" : "booked";
    if (status === "boarded") {
      boardedAt = nairobiInstant(trip.serviceDate, trip.departTime).toISOString();
    }
  } else {
    status = chance(0.03) ? "cancelled" : "booked";
  }

  if (status !== "cancelled") {
    monthToDate.set(monthKey, spent + split.employerKes);
  } else {
    trip.taken.pop(); // a cancelled seat goes back on sale
  }

  bookingSeq += 1;
  const bookedDaysBefore = Math.min(6, 1 + Math.floor(rand() * 4));
  insertBooking.run(
    `bkg_${String(bookingSeq).padStart(6, "0")}`,
    trip.id,
    rider.id,
    boardId,
    alightId,
    seatNo,
    split.fareKes,
    split.employerKes,
    split.employeeKes,
    uniquePassCode(),
    status,
    nairobiInstant(addDays(trip.serviceDate, -bookedDaysBefore), "20:00").toISOString(),
    boardedAt,
  );
  bookingCount += 1;
}

const seedBookings = conn.transaction(() => {
  for (const serviceDate of serviceDates) {
    const daysAhead = Math.round(
      (nairobiInstant(serviceDate, "12:00").getTime() -
        nairobiInstant(today, "12:00").getTime()) /
        86400000,
    );
    const rate = bookingRateForLeadTime(daysAhead);

    for (const rider of riders) {
      if (!chance(rate * rider.loyalty)) continue;

      const morning = tripByKey.get(
        `${rider.option.routeId}|inbound|${serviceDate}|${pick(timetableFor(serviceDate, "inbound"))}`,
      );
      if (morning) book(morning, rider, rider.option.boardSlug, rider.option.hubSlug);

      // Most riders take the bus home too, but not all — evening plans happen.
      if (chance(0.82)) {
        const evening = tripByKey.get(
          `${rider.option.routeId}|outbound|${serviceDate}|${pick(timetableFor(serviceDate, "outbound"))}`,
        );
        if (evening) book(evening, rider, rider.option.hubSlug, rider.option.boardSlug);
      }
    }
  }
});

seedBookings();

/* -------------------------------------------------------------- *
 * Live telemetry for anything currently rolling
 * -------------------------------------------------------------- */

const insertPing = conn.prepare(
  "INSERT INTO vehicle_pings (trip_id, lat, lng, speed_kph, recorded_at) VALUES (?, ?, ?, ?, ?)",
);

let pings = 0;
for (const trip of trips.filter((t) => t.status === "in_transit")) {
  const departsAt = nairobiInstant(trip.serviceDate, trip.departTime);
  const elapsed = (now.getTime() - departsAt.getTime()) / 60000;
  const total = trip.stops[trip.stops.length - 1].minFromStart * 1.6;
  const progress = Math.max(0, Math.min(1, elapsed / total));
  const km = progress * trip.stops[trip.stops.length - 1].kmFromStart;

  // Place the ping between the two stops that bracket the distance covered.
  let from = trip.stops[0];
  let to = trip.stops[trip.stops.length - 1];
  for (let i = 0; i < trip.stops.length - 1; i += 1) {
    if (km >= trip.stops[i].kmFromStart) {
      from = trip.stops[i];
      to = trip.stops[i + 1];
    }
  }
  const legSpan = to.kmFromStart - from.kmFromStart;
  const t = legSpan > 0 ? (km - from.kmFromStart) / legSpan : 0;

  insertPing.run(
    trip.id,
    from.lat + (to.lat - from.lat) * t,
    from.lng + (to.lng - from.lng) * t,
    18 + Math.round(rand() * 30),
    nowIso,
  );
  pings += 1;
}

/* -------------------------------------------------------------- *
 * Disruption, so the operations board has something to run
 * -------------------------------------------------------------- */

const insertIncident = conn.prepare(
  `INSERT INTO incidents
     (id, trip_id, reporter_kind, reporter_id, kind, note, delay_minutes, created_at, resolved_at)
   VALUES (?,?,?,?,?,?,?,?,?)`,
);
const setDelay = conn.prepare("UPDATE trips SET delay_minutes = ? WHERE id = ?");

// The seed writes audit entries directly rather than through lib/audit, which
// would open a second connection to the same file for no reason.
const insertAudit = conn.prepare(
  `INSERT INTO audit_events
     (at, actor_kind, actor_id, actor_name, action,
      subject_kind, subject_id, subject_label, summary, detail, company_id)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
);

const routeCodeById = new Map(ROUTES.map((r) => [`rte_${r.slug}`, r.code]));
const tripLabel = (t: TripRecord) =>
  `${routeCodeById.get(t.routeId)} ${t.departTime} on ${t.serviceDate}`;

const INCIDENT_SCRIPT: { kind: string; note: string; delay: number }[] = [
  { kind: "traffic", note: "Standstill at Githurai flyover, three lanes merging", delay: 20 },
  { kind: "breakdown", note: "Matatu broken down across the service lane at Kangemi", delay: 15 },
  { kind: "weather", note: "Heavy rain on Ngong Road, crawling past Dagoretti Corner", delay: 12 },
  { kind: "traffic", note: "Diversion at Nyayo roundabout for roadworks", delay: 10 },
  { kind: "other", note: "Held at the Gigiri gate for security screening", delay: 8 },
  { kind: "accident", note: "Collision blocking the Mombasa Road underpass", delay: 30 },
];

let incidentCount = 0;

// Things go wrong on runs that have already happened as well as on live ones,
// so the board has history to show even outside the peaks. A run that has
// finished always has its incident closed — control does not leave yesterday's
// jam sitting open.
const recentDates = new Set(serviceDates.filter((d) => d <= today).slice(-4));
const disruptable = trips.filter((t) => recentDates.has(t.serviceDate) && t.status !== "cancelled");

// Roughly one run in twelve hits something.
for (const [index, trip] of disruptable.entries()) {
  if (!chance(0.06)) continue;
  const script = INCIDENT_SCRIPT[index % INCIDENT_SCRIPT.length];
  const resolved = trip.status === "completed" ? true : chance(0.35);

  incidentCount += 1;
  insertIncident.run(
    `inc_${String(incidentCount).padStart(4, "0")}`,
    trip.id,
    "driver",
    `drv_${String((index % fleetSize) + 1).padStart(3, "0")}`,
    script.kind,
    script.note,
    script.delay,
    nairobiInstant(trip.serviceDate, trip.departTime).toISOString(),
    resolved ? nowIso : null,
  );

  const driverId = `drv_${String((index % fleetSize) + 1).padStart(3, "0")}`;
  const driverName = roster[index % fleetSize].name;
  const raisedAt = nairobiInstant(trip.serviceDate, trip.departTime).toISOString();

  insertAudit.run(
    raisedAt,
    "driver",
    driverId,
    driverName,
    "incident.raise",
    "trip",
    trip.id,
    tripLabel(trip),
    `Reported ${script.kind} on ${tripLabel(trip)}: ${script.note} (+${script.delay} min)`,
    JSON.stringify({ kind: script.kind, delayMinutes: script.delay }),
    null,
  );
  insertAudit.run(
    raisedAt,
    "driver",
    driverId,
    driverName,
    "trip.delay",
    "trip",
    trip.id,
    tripLabel(trip),
    `Put ${tripLabel(trip)} ${script.delay} minutes behind schedule`,
    JSON.stringify({ from: 0, to: script.delay }),
    null,
  );

  if (resolved) {
    const controller = OPERATORS[incidentCount % OPERATORS.length];
    insertAudit.run(
      nowIso,
      "operator",
      controller.id,
      controller.name,
      "incident.resolve",
      "trip",
      trip.id,
      tripLabel(trip),
      `Resolved the ${script.kind} incident on ${tripLabel(trip)}`,
      null,
      null,
    );
  }
  // A finished run keeps the delay it actually ran with; a live one is told to
  // control so riders further down the line see it.
  setDelay.run(script.delay, trip.id);
}

// Stage arrivals for anything already rolling, so the board is not blank.
const insertArrival = conn.prepare(
  `INSERT INTO trip_stop_events (trip_id, stop_id, arrived_at) VALUES (?,?,?)
   ON CONFLICT (trip_id, stop_id) DO NOTHING`,
);
let arrivalCount = 0;
for (const trip of trips.filter((t) => t.status === "in_transit")) {
  const departsAt = nairobiInstant(trip.serviceDate, trip.departTime);
  const elapsed = (now.getTime() - departsAt.getTime()) / 60000;
  for (const stop of trip.stops) {
    const scheduled = stop.minFromStart * 1.6;
    if (scheduled > elapsed) break;
    insertArrival.run(
      trip.id,
      stop.id,
      new Date(departsAt.getTime() + scheduled * 60000).toISOString(),
    );
    arrivalCount += 1;
  }
}

/* -------------------------------------------------------------- */

const count = (table: string) =>
  (conn.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

console.log(`Seeded Vayliron Shared Transportation at ${DB_PATH}`);
console.log(`  service window   ${serviceDates[0]} → ${serviceDates[serviceDates.length - 1]} (${serviceDates.length} service days)`);
console.log(`  stops            ${count("stops")}`);
console.log(`  routes           ${count("routes")}`);
console.log(`  fleet / drivers  ${count("vehicles")} / ${count("drivers")}`);
console.log(`  companies        ${count("companies")}`);
console.log(`  employees        ${count("employees")}`);
console.log(`  trips            ${count("trips")}`);
console.log(`  bookings         ${bookingCount}`);
console.log(`  live pings       ${pings}`);
console.log(`  incidents        ${incidentCount}`);
console.log(`  audit entries    ${count("audit_events")}`);
console.log(`  stage arrivals   ${arrivalCount}`);
console.log(`  operators        ${count("operators")}`);
console.log("");
console.log("Sign in with any of these — one email, four different apps:");
console.log("");
console.log("  Vayliron control panel");
for (const op of OPERATORS) {
  const role = op.role === "superadmin" ? "network admin" : "controller";
  console.log(`    ${op.email.padEnd(40)} (${op.name}, ${role})`);
}
console.log("");
console.log("  Client control panel");
for (const e of EMPLOYEES.filter((e) => e.role === "admin")) {
  console.log(`    ${e.email.padEnd(40)} (${e.name}, HR admin)`);
}
console.log("");
console.log("  Driver app");
const firstDriver = conn
  .prepare("SELECT name, email FROM drivers WHERE email IS NOT NULL ORDER BY id LIMIT 2")
  .all() as { name: string; email: string }[];
for (const d of firstDriver) {
  console.log(`    ${d.email.padEnd(40)} (${d.name})`);
}
console.log("");
console.log("  Rider app");
console.log(`    ${EMPLOYEES[1].email.padEnd(40)} (${EMPLOYEES[1].name})`);

conn.close();
