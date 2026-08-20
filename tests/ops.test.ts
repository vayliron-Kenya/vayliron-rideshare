import { beforeEach, describe, expect, it } from "vitest";

import { listAudit, subjectHistory, type Actor } from "@/lib/audit";
import { db, readSchema } from "@/lib/db";
import { buildTimetable, nextServiceDate } from "@/lib/domain/schedule";
import { trackTrip } from "@/lib/domain/tracking";
import { nairobiDate, nairobiInstant } from "@/lib/domain/time";
import {
  cancelTrip,
  createEmployee,
  listDrivers,
  listFleet,
  monthlyInvoice,
  networkSnapshot,
  OpsError,
  PeopleError,
  markStopArrived,
  raiseIncident,
  reassignDriver,
  reassignVehicle,
  reinstateTrip,
  setEmployeeActive,
  setTripDelay,
  updateCompanyContract,
  tripStopEvents,
  updateCompanyPolicy,
} from "@/lib/ops";
import {
  boardByPassCode,
  cancelBooking,
  closeTrip,
  createBooking,
  getTrip,
  takenPlaces,
  tripManifest,
} from "@/lib/queries";
import type { RouteStop } from "@/lib/types";

const CONTROLLER: Actor = { kind: "operator", id: "opr_1", name: "Naliaka Wekesa" };
const DRIVER: Actor = { kind: "driver", id: "drv_1", name: "Peter Mwangi" };
const HR: Actor = {
  kind: "employee",
  id: "emp_1",
  name: "Rider 1",
  companyId: "cmp_t",
};

/*
 * Always the next day the network actually runs, never a hardcoded date.
 * `setEmployeeActive` only releases bookings on trips from today onwards, so a
 * fixture pinned to a fixed Monday quietly stops testing anything the moment
 * the calendar passes it.
 */
const SERVICE_DATE = nextServiceDate(nairobiDate());
const TRIP_ID = "trp_test";
const BIG_TRIP_ID = "trp_big";

function reset() {
  const conn = db();
  for (const table of [
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
    "audit_events",
  ]) {
    conn.prepare(`DELETE FROM ${table}`).run();
  }

  const now = new Date().toISOString();
  const stop = conn.prepare(
    "INSERT INTO stops (id, name, slug, area, landmark, lat, lng) VALUES (?,?,?,?,?,?,?)",
  );
  stop.run("stp_a", "Juja Town", "juja", "Thika Road", "Juja Mall", -1.1036, 37.0144);
  stop.run("stp_b", "Roysambu", "roysambu", "Thika Road", "TRM", -1.2192, 36.8867);
  stop.run("stp_c", "Upper Hill", "upper-hill", "Upper Hill", "Britam", -1.2996, 36.8149);

  conn
    .prepare("INSERT INTO routes (id, code, name, slug, corridor, blurb, active) VALUES (?,?,?,?,?,?,1)")
    .run("rte_t", "VL-99", "Test Line", "test-line", "Thika Road", "Fixture line");

  const routeStop = conn.prepare(
    "INSERT INTO route_stops (route_id, stop_id, seq, km_from_start, min_from_start) VALUES (?,?,?,?,?)",
  );
  routeStop.run("rte_t", "stp_a", 0, 0, 0);
  routeStop.run("rte_t", "stp_b", 1, 8.1, 12);
  routeStop.run("rte_t", "stp_c", 2, 20, 30);

  const vehicle = conn.prepare(
    "INSERT INTO vehicles (id, plate, model, capacity, wifi, usb_ports, operator) VALUES (?,?,?,?,?,?,?)",
  );
  vehicle.run("veh_small", "KDA 001A", "Toyota Coaster", 4, 1, 4, "Vayliron Fleet");
  vehicle.run("veh_tiny", "KDA 002B", "Nissan Matatu", 2, 0, 0, "Contracted");
  vehicle.run("veh_big", "KDA 003C", "Scania Higer", 49, 1, 49, "Vayliron Fleet");

  const driver = conn.prepare(
    "INSERT INTO drivers (id, name, phone, psv_licence, rating_bps, email, active) VALUES (?,?,?,?,?,?,?)",
  );
  driver.run("drv_1", "Peter Mwangi", "+254700000001", "PSV-1", 4800, "peter@vayliron.co.ke", 1);
  driver.run("drv_2", "Alice Wanjiru", "+254700000002", "PSV-2", 4900, "alice@vayliron.co.ke", 1);
  driver.run("drv_off", "Kevin Otieno", "+254700000003", "PSV-3", 4600, "kevin@vayliron.co.ke", 0);

  conn
    .prepare(
      `INSERT INTO companies (id, name, email_domain, billing_email, kra_pin, subsidy_bps, monthly_cap_kes, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run("cmp_t", "Tandaza Bank", "tandaza.co.ke", "ap@tandaza.co.ke", "P0X", 10000, 0, now);

  const employee = conn.prepare(
    `INSERT INTO employees (id, company_id, name, email, phone, staff_no, home_stop_id, work_stop_id, role, active, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,1,?)`,
  );
  for (let i = 1; i <= 4; i += 1) {
    employee.run(
      `emp_${i}`,
      "cmp_t",
      `Rider ${i}`,
      `rider${i}@tandaza.co.ke`,
      `+25470000000${i}`,
      `TB-${i}`,
      "stp_a",
      "stp_c",
      i === 1 ? "admin" : "employee",
      now,
    );
  }

  const trip = conn.prepare(
    `INSERT INTO trips (id, route_id, direction, service_date, depart_time, vehicle_id, driver_id, capacity, status, delay_minutes)
     VALUES (?,?,?,?,?,?,?,?,?,0)`,
  );
  trip.run(TRIP_ID, "rte_t", "inbound", SERVICE_DATE, "06:30", "veh_small", "drv_1", 4, "scheduled");
  trip.run(BIG_TRIP_ID, "rte_t", "inbound", SERVICE_DATE, "07:00", "veh_big", "drv_2", 49, "scheduled");
}

const book = (employeeId: string, tripId = TRIP_ID) =>
  createBooking({
    tripId,
    employeeId,
    boardStopId: "stp_a",
    alightStopId: "stp_c",
  });

describe("cancelling a departure", () => {
  beforeEach(reset);

  it("releases every sold seat and records why", () => {
    book("emp_1");
    book("emp_2");

    expect(cancelTrip(TRIP_ID, "Breakdown at Ruiru", CONTROLLER)).toBe(2);

    const trip = getTrip(TRIP_ID)!;
    expect(trip.trip.status).toBe("cancelled");
    expect(trip.trip.cancelReason).toBe("Breakdown at Ruiru");
    expect(takenPlaces(TRIP_ID)).toEqual([]);
  });

  it("takes the trip off the riders' upcoming list rather than stranding them", () => {
    const { booking } = book("emp_1");
    cancelTrip(TRIP_ID, "No unit available", CONTROLLER);

    const row = db().prepare("SELECT status FROM bookings WHERE id = ?").get(booking.id) as {
      status: string;
    };
    expect(row.status).toBe("cancelled");
  });

  it("refuses to cancel a departure that has already run", () => {
    db().prepare("UPDATE trips SET status = 'completed' WHERE id = ?").run(TRIP_ID);
    expect(() => cancelTrip(TRIP_ID, "too late", CONTROLLER)).toThrow(OpsError);
  });

  it("can be reinstated, without silently re-selling the released seats", () => {
    book("emp_1");
    cancelTrip(TRIP_ID, "Roads flooded", CONTROLLER);
    reinstateTrip(TRIP_ID, CONTROLLER);

    const trip = getTrip(TRIP_ID)!;
    expect(trip.trip.status).toBe("scheduled");
    expect(trip.trip.cancelReason).toBeNull();
    expect(trip.seatsBooked).toBe(0);
  });
});

describe("reassigning a departure", () => {
  beforeEach(reset);

  it("swaps in a bigger bus and lifts the capacity", () => {
    book("emp_1");
    reassignVehicle(TRIP_ID, "veh_big", CONTROLLER);

    const trip = getTrip(TRIP_ID)!;
    expect(trip.vehicle.plate).toBe("KDA 003C");
    expect(trip.trip.capacity).toBe(49);
  });

  it("refuses a replacement that cannot seat the riders already booked", () => {
    book("emp_1");
    book("emp_2");
    book("emp_3");

    expect(() => reassignVehicle(TRIP_ID, "veh_tiny", CONTROLLER)).toThrow(
      /3 riders are already booked/,
    );
    expect(getTrip(TRIP_ID)!.trip.capacity).toBe(4);
  });

  it("closes gaps left by cancellations so a smaller bus still fits", () => {
    // Four riders fill the bus, then the first two drop out. The remaining two
    // hold places 3 and 4, which a two-seater does not have — until we compact.
    const first = book("emp_1");
    const second = book("emp_2");
    book("emp_3");
    book("emp_4");
    cancelBooking(first.booking.id, "emp_1");
    cancelBooking(second.booking.id, "emp_2");

    expect(() => reassignVehicle(TRIP_ID, "veh_tiny", CONTROLLER)).not.toThrow();
    expect(getTrip(TRIP_ID)!.trip.capacity).toBe(2);
    expect(tripManifest(TRIP_ID)).toHaveLength(2);
  });

  it("will not roster a driver who has been stood down", () => {
    expect(() => reassignDriver(TRIP_ID, "drv_off", CONTROLLER)).toThrow(/not on the active roster/);
    expect(() => reassignDriver(TRIP_ID, "drv_2", CONTROLLER)).not.toThrow();
    expect(getTrip(TRIP_ID)!.driver.name).toBe("Alice Wanjiru");
  });
});

describe("delays", () => {
  beforeEach(reset);

  it("pushes every arrival time down the line", () => {
    const before = getTrip(TRIP_ID)!.timetable.map((s) => s.time);
    setTripDelay(TRIP_ID, 15, CONTROLLER);
    const after = getTrip(TRIP_ID)!.timetable;

    expect(after[0].time).not.toBe(before[0]);
    expect(after.map((s) => s.adjustedMin)).toEqual([15, 34, 63]);
  });

  it("is clamped to something a shift could survive", () => {
    setTripDelay(TRIP_ID, 9999, CONTROLLER);
    expect(getTrip(TRIP_ID)!.trip.delayMinutes).toBe(240);

    setTripDelay(TRIP_ID, -30, CONTROLLER);
    expect(getTrip(TRIP_ID)!.trip.delayMinutes).toBe(0);
  });

  it("moves the tracked position back by the same amount", () => {
    const stops: RouteStop[] = getTrip(TRIP_ID)!.timetable;
    const departsAt = nairobiInstant(SERVICE_DATE, "06:30");
    const at = new Date(departsAt.getTime() + 20 * 60000);

    const onTime = trackTrip(buildTimetable(stops, "06:30", 0), departsAt, at);
    const late = trackTrip(buildTimetable(stops, "06:30", 15), departsAt, at);

    expect(late.progress).toBeLessThan(onTime.progress);
  });

  it("compounds when a second incident is reported", () => {
    raiseIncident(
      {
        tripId: TRIP_ID,
        kind: "traffic",
        note: "Jam at Githurai",
        delayMinutes: 10,
      },
      DRIVER,
    );
    raiseIncident(
      {
        tripId: TRIP_ID,
        kind: "weather",
        note: "Heavy rain",
        delayMinutes: 8,
      },
      DRIVER,
    );

    expect(getTrip(TRIP_ID)!.trip.delayMinutes).toBe(18);
  });

  it("does not let a stack of incidents run past the clamp", () => {
    for (let i = 0; i < 10; i += 1) {
      raiseIncident(
      {
        tripId: TRIP_ID,
        kind: "traffic",
        note: `Jam ${i}`,
        delayMinutes: 60,
      },
      CONTROLLER,
    );
    }
    expect(getTrip(TRIP_ID)!.trip.delayMinutes).toBe(240);
  });
});

describe("calling a stage", () => {
  beforeEach(reset);

  it("records the arrival", () => {
    markStopArrived(TRIP_ID, "stp_a", DRIVER);
    expect(tripStopEvents(TRIP_ID).map((e) => e.stopId)).toEqual(["stp_a"]);
  });

  it("leaves a reported delay alone on a run that has not departed", () => {
    // 2026-08-17 06:30 is in the past relative to nothing in particular, so the
    // fixture is pinned to a date far enough ahead to be reliably in the future.
    db()
      .prepare("UPDATE trips SET service_date = '2099-01-05' WHERE id = ?")
      .run(TRIP_ID);
    setTripDelay(TRIP_ID, 20, CONTROLLER);

    const result = markStopArrived(TRIP_ID, "stp_a", DRIVER);

    expect(result?.delayMinutes).toBe(20);
    expect(getTrip(TRIP_ID)!.trip.delayMinutes).toBe(20);
  });

  it("turns a late arrival on a departed run into a delay", () => {
    // A run that left two hours ago and is only now calling its first stage.
    const twoHoursAgo = new Date(Date.now() - 120 * 60000);
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(
      twoHoursAgo,
    );
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Nairobi",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(twoHoursAgo);

    db()
      .prepare("UPDATE trips SET service_date = ?, depart_time = ? WHERE id = ?")
      .run(date, time, TRIP_ID);

    const result = markStopArrived(TRIP_ID, "stp_a", DRIVER);
    expect(result!.delayMinutes).toBeGreaterThan(100);
  });

  it("ignores a stage that is not on the trip", () => {
    expect(markStopArrived(TRIP_ID, "stp_nowhere", DRIVER)).toBeNull();
  });
});

describe("the network board", () => {
  beforeEach(reset);

  it("counts load and revenue across every line", () => {
    book("emp_1");
    book("emp_2", BIG_TRIP_ID);

    const snapshot = networkSnapshot(SERVICE_DATE);
    expect(snapshot.departures).toBe(2);
    expect(snapshot.seatsSold).toBe(2);
    expect(snapshot.seatsOffered).toBe(53);
    expect(snapshot.revenueKes).toBe(600);
  });

  it("stops counting seats on a cancelled departure as offered", () => {
    cancelTrip(TRIP_ID, "Unit off the road", CONTROLLER);
    const snapshot = networkSnapshot(SERVICE_DATE);
    expect(snapshot.cancelled).toBe(1);
    expect(snapshot.seatsOffered).toBe(49);
  });

  it("reports fleet and roster utilisation for the day", () => {
    book("emp_1");
    const fleet = listFleet(SERVICE_DATE);
    const small = fleet.find((v) => v.plate === "KDA 001A")!;
    expect(small.runsToday).toBe(1);
    expect(small.seatsSoldToday).toBe(1);
    expect(small.loadPct).toBe(25);

    const drivers = listDrivers(SERVICE_DATE);
    expect(drivers.find((d) => d.id === "drv_1")!.runsToday).toBe(1);
    expect(drivers.find((d) => d.id === "drv_off")!.runsToday).toBe(0);
  });
});

describe("managing staff", () => {
  beforeEach(reset);

  it("insists a work email is on the company's own domain", () => {
    expect(() =>
      createEmployee({
        companyId: "cmp_t",
        name: "Outsider",
        email: "someone@gmail.com",
        phone: "+254700000009",
        staffNo: "X-1",
        homeStopId: null,
        workStopId: null,
        role: "employee",
      }, HR),
    ).toThrow(/must end in @tandaza.co.ke/);
  });

  it("refuses a duplicate work email", () => {
    expect(() =>
      createEmployee({
        companyId: "cmp_t",
        name: "Clone",
        email: "rider1@tandaza.co.ke",
        phone: "+254700000009",
        staffNo: "X-2",
        homeStopId: null,
        workStopId: null,
        role: "employee",
      }, HR),
    ).toThrow(PeopleError);
  });

  it("releases upcoming seats when someone is deactivated", () => {
    book("emp_2");
    const { releasedSeats } = setEmployeeActive("emp_2", "cmp_t", false, HR);

    expect(releasedSeats).toBe(1);
    expect(takenPlaces(TRIP_ID)).toEqual([]);
  });

  it("will not let one company touch another's staff", () => {
    expect(() => setEmployeeActive("emp_2", "cmp_other", false, HR)).toThrow(PeopleError);
  });

  it("rejects a subsidy share outside 0–100%", () => {
    expect(() =>
      updateCompanyPolicy(
        "cmp_t",
        { subsidyBps: 12000, monthlyCapKes: 0, billingEmail: "ap@tandaza.co.ke" },
        HR,
      ),
    ).toThrow(PeopleError);
  });
});

describe("the monthly invoice", () => {
  beforeEach(reset);

  it("bills seats that were held, whether or not the rider showed up", () => {
    const first = book("emp_1");
    book("emp_2");
    boardByPassCode(TRIP_ID, first.booking.passCode);
    closeTrip(TRIP_ID, CONTROLLER); // emp_2 becomes a no-show

    const invoice = monthlyInvoice("cmp_t", SERVICE_DATE.slice(0, 7))!;
    expect(invoice.trips).toBe(2);
    expect(invoice.employerTotalKes).toBe(600);
    expect(invoice.lines).toHaveLength(2);
    expect(invoice.vatKes).toBe(0);
  });

  it("never bills a cancelled seat", () => {
    book("emp_1");
    cancelTrip(TRIP_ID, "Unit off the road", CONTROLLER);

    const invoice = monthlyInvoice("cmp_t", SERVICE_DATE.slice(0, 7))!;
    expect(invoice.trips).toBe(0);
    expect(invoice.employerTotalKes).toBe(0);
  });

  it("excludes a month with no travel", () => {
    book("emp_1");
    closeTrip(TRIP_ID, CONTROLLER);
    expect(monthlyInvoice("cmp_t", "2026-01")!.employerTotalKes).toBe(0);
  });
});

describe("the audit trail", () => {
  beforeEach(reset);

  it("names who cancelled a run and why", () => {
    book("emp_1");
    cancelTrip(TRIP_ID, "Breakdown at Ruiru", CONTROLLER);

    const network = listAudit({ action: "trip.cancel" }).filter((e) => e.companyId === null);
    expect(network).toHaveLength(1);
    expect(network[0]).toMatchObject({
      actorName: "Naliaka Wekesa",
      actorKind: "operator",
      subjectKind: "trip",
      subjectId: TRIP_ID,
    });
    expect(network[0].summary).toContain("Breakdown at Ruiru");
    expect(network[0].detail).toMatchObject({ releasedSeats: 1 });
  });

  it("shows an affected client the cancellation in their own log", () => {
    book("emp_1");
    cancelTrip(TRIP_ID, "Roads flooded", CONTROLLER);

    const clientView = listAudit({ companyId: "cmp_t" });
    expect(clientView).toHaveLength(1);
    expect(clientView[0].summary).toContain("Vayliron cancelled");
  });

  it("does not leak a cancellation to a client with nobody on board", () => {
    cancelTrip(TRIP_ID, "Empty run", CONTROLLER);
    expect(listAudit({ companyId: "cmp_t" })).toHaveLength(0);
  });

  it("keeps the subject label readable after the run is gone", () => {
    cancelTrip(TRIP_ID, "Unit off the road", CONTROLLER);
    db().prepare("DELETE FROM trips WHERE id = ?").run(TRIP_ID);

    const [entry] = listAudit({ action: "trip.cancel" });
    expect(entry.subjectLabel).toBe(`VL-99 06:30 on ${SERVICE_DATE}`);
  });

  it("records both sides of a reassignment", () => {
    reassignVehicle(TRIP_ID, "veh_big", CONTROLLER);

    const [entry] = listAudit({ action: "trip.reassign_vehicle" });
    expect(entry.detail).toMatchObject({ from: "KDA 001A", to: "KDA 003C" });
  });

  it("attributes a delay to the driver who reported it", () => {
    setTripDelay(TRIP_ID, 15, DRIVER);

    const [entry] = listAudit({ action: "trip.delay" });
    expect(entry.actorKind).toBe("driver");
    expect(entry.actorName).toBe("Peter Mwangi");
    expect(entry.detail).toMatchObject({ from: 0, to: 15 });
  });

  it("does not log a delay that changed nothing", () => {
    setTripDelay(TRIP_ID, 0, CONTROLLER);
    expect(listAudit({ action: "trip.delay" })).toHaveLength(0);
  });

  it("scopes staff changes to the client who made them", () => {
    setEmployeeActive("emp_2", "cmp_t", false, HR);

    const [entry] = listAudit({ companyId: "cmp_t" });
    expect(entry.action).toBe("employee.deactivate");
    expect(entry.actorKind).toBe("employee");
    expect(entry.detail).toMatchObject({ releasedSeats: 0 });
  });

  it("shows a client a contract change Vayliron made on their account", () => {
    updateCompanyContract("cmp_t", { subsidyBps: 5000, monthlyCapKes: 3000 }, CONTROLLER);

    const [entry] = listAudit({ companyId: "cmp_t" });
    expect(entry.actorKind).toBe("operator");
    expect(entry.summary).toContain("Vayliron set the employer share to 50%");
    expect(entry.detail).toMatchObject({ subsidyFrom: 10000, subsidyTo: 5000 });
  });

  it("collects one departure's whole history in order", () => {
    setTripDelay(TRIP_ID, 10, CONTROLLER);
    reassignVehicle(TRIP_ID, "veh_big", CONTROLLER);
    cancelTrip(TRIP_ID, "Unit off the road", CONTROLLER);

    const history = subjectHistory("trip", TRIP_ID);
    expect(history.map((e) => e.action)).toEqual([
      "trip.cancel",
      "trip.reassign_vehicle",
      "trip.delay",
    ]);
  });

  it("refuses an incident from someone who is neither crew nor control", () => {
    expect(() =>
      raiseIncident(
        { tripId: TRIP_ID, kind: "traffic", note: "Jam", delayMinutes: 5 },
        HR,
      ),
    ).toThrow(OpsError);
  });

  it("survives an audit write failing without losing the operational change", () => {
    // A trail that can take the network down with it is worse than no trail.
    db().prepare("DROP TABLE audit_events").run();
    expect(() => cancelTrip(TRIP_ID, "Roads flooded", CONTROLLER)).not.toThrow();
    expect(getTrip(TRIP_ID)!.trip.status).toBe("cancelled");
    db().exec(readSchema());
  });
});
