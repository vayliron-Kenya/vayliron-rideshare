import { beforeEach, describe, expect, it } from "vitest";

import { db, readSchema } from "@/lib/db";
import { departureCue, nextDropoff, nextPickup, stageCalls } from "@/lib/dispatch";
import { nairobiInstant } from "@/lib/domain/time";
import { createBooking, getTrip } from "@/lib/queries";

const SERVICE_DATE = "2026-08-17"; // a Monday
const TRIP_ID = "trp_run";

function reset() {
  const conn = db();
  conn.exec(readSchema());
  for (const table of [
    "payments",
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
    "owners",
  ]) {
    conn.prepare(`DELETE FROM ${table}`).run();
  }

  const now = new Date().toISOString();
  const stop = conn.prepare(
    "INSERT INTO stops (id, name, slug, area, landmark, lat, lng) VALUES (?,?,?,?,?,?,?)",
  );
  stop.run("stp_a", "Kikuyu Town", "kikuyu", "Waiyaki Way", "Kikuyu Stage", -1.2464, 36.6636);
  stop.run("stp_b", "Kinoo", "kinoo", "Waiyaki Way", "Kinoo 87", -1.2554, 36.6934);
  stop.run("stp_c", "Westlands", "westlands", "Westlands", "Sarit Centre", -1.2673, 36.8034);

  conn
    .prepare(
      "INSERT INTO routes (id, code, name, slug, corridor, blurb, active) VALUES (?,?,?,?,?,?,1)",
    )
    .run("rte_r", "VL-04", "Waiyaki Way Corridor", "waiyaki", "Waiyaki Way", "Fixture line");

  const routeStop = conn.prepare(
    "INSERT INTO route_stops (route_id, stop_id, seq, km_from_start, min_from_start) VALUES (?,?,?,?,?)",
  );
  routeStop.run("rte_r", "stp_a", 0, 0, 0);
  routeStop.run("rte_r", "stp_b", 1, 4.2, 10);
  routeStop.run("rte_r", "stp_c", 2, 18.5, 34);

  conn
    .prepare(
      "INSERT INTO vehicles (id, plate, model, capacity, wifi, usb_ports, operator, status) VALUES (?,?,?,?,?,?,?,'approved')",
    )
    .run("veh_r", "KDC 914Y", "Toyota Coaster", 26, 0, 0, "Kasarani Star SACCO");

  conn
    .prepare(
      "INSERT INTO drivers (id, name, phone, psv_licence, rating_bps, email, active) VALUES (?,?,?,?,?,?,1)",
    )
    .run("drv_r", "Grace Achieng", "+254700000009", "PSV-9", 4800, "grace@vayliron.co.ke");

  conn
    .prepare(
      `INSERT INTO companies (id, name, email_domain, billing_email, kra_pin, subsidy_bps, monthly_cap_kes, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run("cmp_r", "Zuri Health", "zurihealth.co.ke", "ap@zuri.co.ke", "P0Z", 5000, 0, now);

  const employee = conn.prepare(
    `INSERT INTO employees (id, company_id, name, email, phone, staff_no, home_stop_id, work_stop_id, role, active, created_at)
     VALUES (?,?,?,?,?,?,?,?,'employee',1,?)`,
  );
  for (let i = 1; i <= 4; i += 1) {
    employee.run(
      `emp_${i}`,
      "cmp_r",
      `Rider ${i}`,
      `rider${i}@zurihealth.co.ke`,
      `+25470000000${i}`,
      `Z-${i}`,
      "stp_a",
      "stp_c",
      now,
    );
  }

  conn
    .prepare(
      `INSERT INTO trips (id, route_id, direction, service_date, depart_time, vehicle_id, driver_id, capacity, status, delay_minutes)
       VALUES (?,?,?,?,?,?,?,?,?,0)`,
    )
    .run(TRIP_ID, "rte_r", "inbound", SERVICE_DATE, "06:30", "veh_r", "drv_r", 26, "scheduled");
}

/** The moment the fixture run is scheduled to leave its terminus. */
const departsAt = () => nairobiInstant(SERVICE_DATE, "06:30");
const minutesBefore = (n: number) => new Date(departsAt().getTime() - n * 60000);
const minutesAfter = (n: number) => new Date(departsAt().getTime() + n * 60000);

const book = (employeeId: string, board: string, alight: string) =>
  createBooking({ tripId: TRIP_ID, employeeId, boardStopId: board, alightStopId: alight });

describe("who is waiting where", () => {
  beforeEach(reset);

  it("counts boardings and alightings against the right stages", () => {
    book("emp_1", "stp_a", "stp_c");
    book("emp_2", "stp_a", "stp_b");
    book("emp_3", "stp_b", "stp_c");

    const stages = stageCalls(getTrip(TRIP_ID)!, minutesBefore(20));
    const [kikuyu, kinoo, westlands] = stages;

    expect(kikuyu.boarding).toBe(2);
    expect(kikuyu.alighting).toBe(0);
    expect(kinoo.boarding).toBe(1);
    expect(kinoo.alighting).toBe(1);
    expect(westlands.alighting).toBe(2);
  });

  it("lists a stage nobody uses rather than hiding it", () => {
    book("emp_1", "stp_a", "stp_c");
    const stages = stageCalls(getTrip(TRIP_ID)!, minutesBefore(20));

    expect(stages).toHaveLength(3);
    expect(stages[1]).toMatchObject({ name: "Kinoo", boarding: 0, alighting: 0 });
  });

  it("points at the next stage with someone on it, not merely the next stage", () => {
    book("emp_1", "stp_b", "stp_c");
    const stages = stageCalls(getTrip(TRIP_ID)!, minutesBefore(20));

    expect(nextPickup(stages)?.name).toBe("Kinoo");
    expect(nextDropoff(stages)?.name).toBe("Westlands");
  });

  it("stops offering a stage once it has been called", () => {
    book("emp_1", "stp_a", "stp_c");
    db()
      .prepare("INSERT INTO trip_stop_events (trip_id, stop_id, arrived_at) VALUES (?,?,?)")
      .run(TRIP_ID, "stp_a", new Date().toISOString());

    const stages = stageCalls(getTrip(TRIP_ID)!, minutesBefore(20));
    expect(stages[0].called).toBe(true);
    expect(nextPickup(stages)).toBeNull();
  });
});

describe("telling a driver whether to move", () => {
  beforeEach(reset);

  const cueAt = (at: Date) => {
    const trip = getTrip(TRIP_ID)!;
    return departureCue(trip, stageCalls(trip, at), at);
  };

  it("holds the bus when it is early", () => {
    const cue = cueAt(minutesBefore(20));
    expect(cue.cue).toBe("hold");
    expect(cue.headline).toBe("Hold 20 min");
  });

  it("says go on the minute", () => {
    expect(cueAt(departsAt()).headline).toBe("Leave now");
  });

  it("says go in the last few minutes rather than holding to the second", () => {
    expect(cueAt(minutesBefore(3)).cue).toBe("go");
  });

  it("names how late it is once the departure has passed", () => {
    const cue = cueAt(minutesAfter(7));
    expect(cue.cue).toBe("late");
    expect(cue.headline).toBe("7 min late");
    expect(cue.slackMinutes).toBeLessThan(0);
  });

  it("does not talk in hundreds of minutes", () => {
    // Two hours out: still a wait a driver is actually sitting through.
    expect(cueAt(minutesBefore(120)).headline).toBe("Hold 2 hours");
  });

  it("stops saying hold once the run is not today's problem", () => {
    // Tomorrow's run, opened tonight. Nobody is sitting at the wheel.
    const cue = cueAt(minutesBefore(686));
    expect(cue.headline).toBe("Not yet · 06:30");
    expect(cue.detail).toContain("11 hours");
  });

  it("keeps talking about the terminus when a run was started early", () => {
    // A driver taps "start the run" before the clock. The status says in
    // transit; the bus is standing still. The cue has to follow the bus.
    db().prepare("UPDATE trips SET status = 'in_transit' WHERE id = ?").run(TRIP_ID);

    const cue = cueAt(minutesBefore(30));
    expect(cue.cue).toBe("hold");
    expect(cue.headline).toBe("Hold 30 min");
  });

  it("counts down to the next stage once the bus is actually moving", () => {
    book("emp_1", "stp_b", "stp_c");
    db().prepare("UPDATE trips SET status = 'in_transit' WHERE id = ?").run(TRIP_ID);
    db()
      .prepare("INSERT INTO trip_stop_events (trip_id, stop_id, arrived_at) VALUES (?,?,?)")
      .run(TRIP_ID, "stp_a", new Date().toISOString());

    // Kinoo is 10 minutes down the line; sit 4 minutes past departure.
    const cue = cueAt(minutesAfter(4));
    expect(cue.cue).toBe("go");
    expect(cue.headline).toContain("Kinoo");
    expect(cue.detail).toContain("1 waiting");
  });

  it("says a stage is now when the bus is on top of it", () => {
    book("emp_1", "stp_b", "stp_c");
    db().prepare("UPDATE trips SET status = 'in_transit' WHERE id = ?").run(TRIP_ID);
    db()
      .prepare("INSERT INTO trip_stop_events (trip_id, stop_id, arrived_at) VALUES (?,?,?)")
      .run(TRIP_ID, "stp_a", new Date().toISOString());

    // Read Kinoo's own due time off the run rather than assuming free-flow —
    // a 06:30 departure is in the morning peak, so the leg is stretched.
    const atDeparture = stageCalls(getTrip(TRIP_ID)!, departsAt());
    const kinooDue = atDeparture.find((s) => s.name === "Kinoo")!.minutesAway;

    expect(cueAt(minutesAfter(kinooDue)).headline).toBe("Kinoo now");
  });

  it("says nothing more to do once every stage is called", () => {
    db().prepare("UPDATE trips SET status = 'in_transit' WHERE id = ?").run(TRIP_ID);
    const arrived = db().prepare(
      "INSERT INTO trip_stop_events (trip_id, stop_id, arrived_at) VALUES (?,?,?)",
    );
    for (const stop of ["stp_a", "stp_b", "stp_c"]) {
      arrived.run(TRIP_ID, stop, new Date().toISOString());
    }

    expect(cueAt(minutesAfter(40)).cue).toBe("done");
  });

  it("has nothing to say about a cancelled run", () => {
    db().prepare("UPDATE trips SET status = 'cancelled' WHERE id = ?").run(TRIP_ID);
    expect(cueAt(minutesBefore(10))).toMatchObject({ cue: "done", headline: "Run finished" });
  });
});
