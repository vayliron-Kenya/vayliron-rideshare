import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import {
  boardByPassCode,
  BookingError,
  cancelBooking,
  closeTrip,
  commuteMatches,
  companyMetrics,
  createBooking,
  employerSpendThisMonth,
  getTrip,
  listBookingsForEmployee,
  takenSeats,
  tripManifest,
} from "@/lib/queries";

/**
 * A four-seat bus on a three-stage line, which makes capacity and cap
 * behaviour easy to drive to their edges.
 */
const SERVICE_DATE = "2026-08-17"; // a Monday
const TRIP_ID = "trp_test";

function reset(options: { subsidyBps?: number; monthlyCapKes?: number } = {}) {
  const conn = db();
  for (const table of [
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
  ]) {
    conn.prepare(`DELETE FROM ${table}`).run();
  }

  const now = new Date().toISOString();

  conn
    .prepare("INSERT INTO stops (id, name, slug, area, landmark, lat, lng) VALUES (?,?,?,?,?,?,?)")
    .run("stp_a", "Juja Town", "juja", "Thika Road", "Juja Mall", -1.1036, 37.0144);
  conn
    .prepare("INSERT INTO stops (id, name, slug, area, landmark, lat, lng) VALUES (?,?,?,?,?,?,?)")
    .run("stp_b", "Roysambu", "roysambu", "Thika Road", "TRM", -1.2192, 36.8867);
  conn
    .prepare("INSERT INTO stops (id, name, slug, area, landmark, lat, lng) VALUES (?,?,?,?,?,?,?)")
    .run("stp_c", "Upper Hill", "upper-hill", "Upper Hill", "Britam", -1.2996, 36.8149);

  conn
    .prepare("INSERT INTO routes (id, code, name, slug, corridor, blurb, active) VALUES (?,?,?,?,?,?,1)")
    .run("rte_t", "VL-99", "Test Line", "test-line", "Thika Road", "Fixture line");

  const insertRouteStop = conn.prepare(
    "INSERT INTO route_stops (route_id, stop_id, seq, km_from_start, min_from_start) VALUES (?,?,?,?,?)",
  );
  insertRouteStop.run("rte_t", "stp_a", 0, 0, 0);
  insertRouteStop.run("rte_t", "stp_b", 1, 8.1, 12); // 8.1 km -> the 220 band
  insertRouteStop.run("rte_t", "stp_c", 2, 20, 30); // 20 km end to end -> the 300 band

  conn
    .prepare("INSERT INTO vehicles (id, plate, model, capacity, wifi, usb_ports, operator) VALUES (?,?,?,?,?,?,?)")
    .run("veh_t", "KDA 001A", "Toyota Coaster", 4, 1, 4, "Vayliron Fleet");
  conn
    .prepare("INSERT INTO drivers (id, name, phone, psv_licence, rating_bps) VALUES (?,?,?,?,?)")
    .run("drv_t", "Peter Mwangi", "+254700000000", "PSV-000001", 4800);

  conn
    .prepare(
      `INSERT INTO companies (id, name, email_domain, billing_email, kra_pin, subsidy_bps, monthly_cap_kes, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(
      "cmp_t",
      "Tandaza Bank",
      "tandaza.co.ke",
      "ap@tandaza.co.ke",
      "P000000000X",
      options.subsidyBps ?? 10000,
      options.monthlyCapKes ?? 0,
      now,
    );

  const insertEmployee = conn.prepare(
    `INSERT INTO employees (id, company_id, name, email, phone, staff_no, home_stop_id, work_stop_id, role, active, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,1,?)`,
  );
  for (let i = 1; i <= 6; i += 1) {
    insertEmployee.run(
      `emp_${i}`,
      "cmp_t",
      `Rider ${i}`,
      `rider${i}@tandaza.co.ke`,
      `+25470000000${i}`,
      `TB-000${i}`,
      "stp_a",
      "stp_c",
      "employee",
      now,
    );
  }

  const insertTrip = conn.prepare(
    `INSERT INTO trips (id, route_id, direction, service_date, depart_time, vehicle_id, driver_id, capacity, status)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  );
  insertTrip.run(TRIP_ID, "rte_t", "inbound", SERVICE_DATE, "06:30", "veh_t", "drv_t", 4, "scheduled");
  insertTrip.run("trp_other", "rte_t", "inbound", SERVICE_DATE, "07:00", "veh_t", "drv_t", 4, "scheduled");
}

const bookFullLine = (employeeId: string, seatNo?: number) =>
  createBooking({
    tripId: TRIP_ID,
    employeeId,
    boardStopId: "stp_a",
    alightStopId: "stp_c",
    seatNo,
  });

describe("creating a booking", () => {
  beforeEach(() => reset());

  it("prices the leg travelled, not the whole line", () => {
    const short = createBooking({
      tripId: TRIP_ID,
      employeeId: "emp_1",
      boardStopId: "stp_a",
      alightStopId: "stp_b",
    });
    expect(short.booking.fareKes).toBe(220);

    const long = createBooking({
      tripId: TRIP_ID,
      employeeId: "emp_2",
      boardStopId: "stp_a",
      alightStopId: "stp_c",
    });
    expect(long.booking.fareKes).toBe(300);
  });

  it("issues a distinct seat and pass code to each rider", () => {
    const first = bookFullLine("emp_1");
    const second = bookFullLine("emp_2");

    expect(first.booking.seatNo).toBe(1);
    expect(second.booking.seatNo).toBe(2);
    expect(first.booking.passCode).not.toBe(second.booking.passCode);
    expect(takenSeats(TRIP_ID)).toEqual([1, 2]);
  });

  it("honours a requested seat", () => {
    const booking = bookFullLine("emp_1", 3);
    expect(booking.booking.seatNo).toBe(3);
    expect(bookFullLine("emp_2").booking.seatNo).toBe(1);
  });

  it("splits the fare to the shilling", () => {
    const { booking } = bookFullLine("emp_1");
    expect(booking.employerKes + booking.employeeKes).toBe(booking.fareKes);
    expect(booking.employerKes).toBe(300);
    expect(booking.employeeKes).toBe(0);
  });

  it("refuses a second seat on the same departure", () => {
    bookFullLine("emp_1");
    expect(() => bookFullLine("emp_1")).toThrow(
      expect.objectContaining({ code: "already_booked" }),
    );
  });

  it("refuses a seat someone else already holds", () => {
    bookFullLine("emp_1", 2);
    try {
      bookFullLine("emp_2", 2);
      throw new Error("expected the booking to be rejected");
    } catch (err) {
      expect(err).toBeInstanceOf(BookingError);
      expect((err as BookingError).code).toBe("seat_taken");
    }
  });

  it("refuses a seat that does not exist on the bus", () => {
    expect(() => bookFullLine("emp_1", 99)).toThrow(
      expect.objectContaining({ code: "seat_taken" }),
    );
  });

  it("refuses to oversell the bus", () => {
    for (const id of ["emp_1", "emp_2", "emp_3", "emp_4"]) bookFullLine(id);
    expect(getTrip(TRIP_ID)?.seatsAvailable).toBe(0);
    expect(() => bookFullLine("emp_5")).toThrow(expect.objectContaining({ code: "trip_full" }));
  });

  it("refuses a leg that runs backwards along the trip", () => {
    expect(() =>
      createBooking({
        tripId: TRIP_ID,
        employeeId: "emp_1",
        boardStopId: "stp_c",
        alightStopId: "stp_a",
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_stops" }));
  });

  it("refuses a stop that is not on the line", () => {
    expect(() =>
      createBooking({
        tripId: TRIP_ID,
        employeeId: "emp_1",
        boardStopId: "stp_a",
        alightStopId: "stp_nowhere",
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_stops" }));
  });

  it("refuses a departure that has already run", () => {
    db().prepare("UPDATE trips SET status = 'completed' WHERE id = ?").run(TRIP_ID);
    expect(() => bookFullLine("emp_1")).toThrow(expect.objectContaining({ code: "trip_closed" }));
  });
});

describe("cancelling", () => {
  beforeEach(() => reset());

  it("puts the seat back on sale", () => {
    const { booking } = bookFullLine("emp_1", 1);
    expect(cancelBooking(booking.id, "emp_1")).toBe(true);
    expect(takenSeats(TRIP_ID)).toEqual([]);
    expect(bookFullLine("emp_2", 1).booking.seatNo).toBe(1);
  });

  it("lets the rider book the departure again afterwards", () => {
    const { booking } = bookFullLine("emp_1");
    cancelBooking(booking.id, "emp_1");
    expect(() => bookFullLine("emp_1")).not.toThrow();
  });

  it("will not let one rider cancel another's seat", () => {
    const { booking } = bookFullLine("emp_1");
    expect(cancelBooking(booking.id, "emp_2")).toBe(false);
    expect(takenSeats(TRIP_ID)).toEqual([1]);
  });

  it("is not double-counted in the rider's history", () => {
    const { booking } = bookFullLine("emp_1");
    cancelBooking(booking.id, "emp_1");
    expect(listBookingsForEmployee("emp_1")).toHaveLength(0);
    expect(listBookingsForEmployee("emp_1", { includeCancelled: true })).toHaveLength(1);
  });
});

describe("the monthly employer cap", () => {
  beforeEach(() => reset({ subsidyBps: 10000, monthlyCapKes: 500 }));

  it("shifts the balance to the rider once the allowance runs out", () => {
    const first = bookFullLine("emp_1");
    expect(first.booking.employerKes).toBe(300);
    expect(employerSpendThisMonth("emp_1", SERVICE_DATE)).toBe(300);

    const second = createBooking({
      tripId: "trp_other",
      employeeId: "emp_1",
      boardStopId: "stp_a",
      alightStopId: "stp_c",
    });
    // Only 200 of the 500 allowance was left.
    expect(second.booking.employerKes).toBe(200);
    expect(second.booking.employeeKes).toBe(100);
    expect(second.split.capApplied).toBe(true);
  });

  it("counts each rider's allowance separately", () => {
    bookFullLine("emp_1");
    expect(employerSpendThisMonth("emp_2", SERVICE_DATE)).toBe(0);
    expect(bookFullLine("emp_2").booking.employerKes).toBe(300);
  });
});

describe("the door", () => {
  beforeEach(() => reset());

  it("checks a rider in against their pass code", () => {
    const { booking } = bookFullLine("emp_1");
    const result = boardByPassCode(TRIP_ID, booking.passCode);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.employee.id).toBe("emp_1");
      expect(result.entry.booking.status).toBe("boarded");
      expect(result.entry.booking.boardedAt).not.toBeNull();
    }
  });

  it("accepts a code typed in lower case with stray spaces", () => {
    const { booking } = bookFullLine("emp_1");
    expect(boardByPassCode(TRIP_ID, `  ${booking.passCode.toLowerCase()} `).ok).toBe(true);
  });

  it("refuses the same pass twice", () => {
    const { booking } = bookFullLine("emp_1");
    boardByPassCode(TRIP_ID, booking.passCode);
    expect(boardByPassCode(TRIP_ID, booking.passCode)).toEqual({
      ok: false,
      reason: "already_boarded",
    });
  });

  it("refuses a pass issued for another departure", () => {
    const { booking } = bookFullLine("emp_1");
    expect(boardByPassCode("trp_other", booking.passCode)).toEqual({
      ok: false,
      reason: "wrong_trip",
    });
  });

  it("refuses a code that was never issued", () => {
    expect(boardByPassCode(TRIP_ID, "ZZZZZZ")).toEqual({ ok: false, reason: "not_found" });
  });

  it("orders the manifest by seat and groups riders by stage", () => {
    bookFullLine("emp_2", 3);
    bookFullLine("emp_1", 1);
    const manifest = tripManifest(TRIP_ID);

    expect(manifest.map((m) => m.booking.seatNo)).toEqual([1, 3]);
    expect(manifest[0].employee.name).toBe("Rider 1");
    expect(manifest[0].companyName).toBe("Tandaza Bank");
    expect(manifest[0].boardStop.id).toBe("stp_a");
  });

  it("marks everyone who never scanned as a no-show when the run closes", () => {
    const first = bookFullLine("emp_1");
    bookFullLine("emp_2");
    boardByPassCode(TRIP_ID, first.booking.passCode);

    expect(closeTrip(TRIP_ID)).toBe(1);
    expect(getTrip(TRIP_ID)?.trip.status).toBe("completed");

    const statuses = tripManifest(TRIP_ID).map((m) => m.booking.status);
    expect(statuses).toContain("boarded");
    expect(statuses).not.toContain("booked");
  });
});

describe("finding a line for a commute", () => {
  beforeEach(() => reset());

  it("matches the morning run towards work", () => {
    const matches = commuteMatches("stp_a", "stp_c");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ direction: "inbound", km: 20 });
  });

  it("matches the same line backwards for the trip home", () => {
    const matches = commuteMatches("stp_c", "stp_a");
    expect(matches[0]).toMatchObject({ direction: "outbound", km: 20 });
  });

  it("returns nothing for a stop the network does not serve", () => {
    expect(commuteMatches("stp_a", "stp_nowhere")).toEqual([]);
    expect(commuteMatches("stp_a", "stp_a")).toEqual([]);
  });
});

describe("company reporting", () => {
  beforeEach(() => reset({ subsidyBps: 7500 }));

  it("adds up spend, attendance and headcount over the period", () => {
    const first = bookFullLine("emp_1");
    bookFullLine("emp_2");
    boardByPassCode(TRIP_ID, first.booking.passCode);
    closeTrip(TRIP_ID);

    const metrics = companyMetrics("cmp_t", SERVICE_DATE, SERVICE_DATE);
    expect(metrics).not.toBeNull();
    expect(metrics!.headcount).toBe(6);
    expect(metrics!.tripsTaken).toBe(1);
    expect(metrics!.noShows).toBe(1);
    expect(metrics!.attendancePct).toBe(50);
    // 75% of a 300 shilling fare, for the one rider who actually travelled.
    expect(metrics!.employerKes).toBe(225);
    expect(metrics!.employeeKes).toBe(75);
    expect(metrics!.co2SavedKg).toBe(Math.round((20 * 160) / 1000));
  });

  it("excludes periods with no travel", () => {
    const metrics = companyMetrics("cmp_t", "2026-01-01", "2026-01-31");
    expect(metrics!.tripsTaken).toBe(0);
    expect(metrics!.employerKes).toBe(0);
    expect(metrics!.attendancePct).toBe(0);
  });
});
