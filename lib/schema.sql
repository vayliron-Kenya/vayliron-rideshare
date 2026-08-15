-- Vayliron corporate bus line — schema
-- SQLite. All money is stored in whole Kenyan shillings (KES), never floats.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email_domain  TEXT NOT NULL UNIQUE,       -- staff are recognised by their work email
  billing_email TEXT NOT NULL,
  kra_pin       TEXT NOT NULL,              -- required on every Kenyan tax invoice
  -- Share of the fare the employer picks up, in basis points (7500 = 75%).
  subsidy_bps   INTEGER NOT NULL DEFAULT 10000 CHECK (subsidy_bps BETWEEN 0 AND 10000),
  -- Per-employee monthly ceiling on the employer's share. 0 = uncapped.
  monthly_cap_kes INTEGER NOT NULL DEFAULT 0 CHECK (monthly_cap_kes >= 0),
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stops (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  slug      TEXT NOT NULL UNIQUE,
  area      TEXT NOT NULL,                  -- Nairobi sub-region, e.g. "Thika Road"
  landmark  TEXT NOT NULL,                  -- what a commuter actually looks for
  lat       REAL NOT NULL,
  lng       REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS routes (
  id        TEXT PRIMARY KEY,
  code      TEXT NOT NULL UNIQUE,           -- VL-01
  name      TEXT NOT NULL,
  slug      TEXT NOT NULL UNIQUE,
  corridor  TEXT NOT NULL,
  blurb     TEXT NOT NULL,
  active    INTEGER NOT NULL DEFAULT 1
);

-- Stops in origin -> destination order. The reverse trip walks this list backwards.
CREATE TABLE IF NOT EXISTS route_stops (
  route_id      TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_id       TEXT NOT NULL REFERENCES stops(id),
  seq           INTEGER NOT NULL,
  km_from_start REAL NOT NULL,
  -- Minutes from the first stop at free-flow speed. Peak factors are applied at runtime.
  min_from_start INTEGER NOT NULL,
  PRIMARY KEY (route_id, stop_id),
  UNIQUE (route_id, seq)
);

CREATE TABLE IF NOT EXISTS vehicles (
  id        TEXT PRIMARY KEY,
  plate     TEXT NOT NULL UNIQUE,
  model     TEXT NOT NULL,
  capacity  INTEGER NOT NULL CHECK (capacity > 0),
  wifi      INTEGER NOT NULL DEFAULT 0,
  usb_ports INTEGER NOT NULL DEFAULT 0,
  operator  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drivers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  psv_licence TEXT NOT NULL UNIQUE,         -- NTSA PSV badge number
  rating_bps INTEGER NOT NULL DEFAULT 5000, -- 0..5000, i.e. 4.7 stars = 4700
  -- Drivers sign in to the driver app in their own right, so they carry
  -- credentials rather than existing only as a name on a manifest.
  email      TEXT UNIQUE,
  active     INTEGER NOT NULL DEFAULT 1
);

-- Vayliron's own staff: the people who run the network, as distinct from the
-- client companies who buy seats on it.
CREATE TABLE IF NOT EXISTS operators (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  phone      TEXT NOT NULL,
  -- controller: runs the daily board. superadmin: also edits the network,
  -- the fleet and client contracts.
  role       TEXT NOT NULL DEFAULT 'controller'
             CHECK (role IN ('controller', 'superadmin')),
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  phone        TEXT NOT NULL,               -- +2547.. used for M-Pesa STK push
  staff_no     TEXT NOT NULL,
  home_stop_id TEXT REFERENCES stops(id),
  work_stop_id TEXT REFERENCES stops(id),
  role         TEXT NOT NULL DEFAULT 'employee'
               CHECK (role IN ('employee', 'admin', 'driver')),
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trips (
  id           TEXT PRIMARY KEY,
  route_id     TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  -- inbound = towards the workplace (morning), outbound = towards home (evening)
  direction    TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  service_date TEXT NOT NULL,               -- YYYY-MM-DD, Africa/Nairobi
  depart_time  TEXT NOT NULL,               -- HH:MM, local
  vehicle_id   TEXT NOT NULL REFERENCES vehicles(id),
  driver_id    TEXT NOT NULL REFERENCES drivers(id),
  capacity     INTEGER NOT NULL CHECK (capacity > 0),
  status       TEXT NOT NULL DEFAULT 'scheduled'
               CHECK (status IN ('scheduled','boarding','in_transit','completed','cancelled')),
  -- Minutes this departure is running behind, set by the driver or by control.
  -- Every downstream arrival time and rider ETA shifts by it.
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  cancel_reason TEXT,
  UNIQUE (route_id, direction, service_date, depart_time)
);

CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(service_date, direction);
CREATE INDEX IF NOT EXISTS idx_trips_route_date ON trips(route_id, service_date);

CREATE TABLE IF NOT EXISTS bookings (
  id             TEXT PRIMARY KEY,
  trip_id        TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  employee_id    TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  board_stop_id  TEXT NOT NULL REFERENCES stops(id),
  alight_stop_id TEXT NOT NULL REFERENCES stops(id),
  seat_no        INTEGER NOT NULL CHECK (seat_no > 0),
  fare_kes       INTEGER NOT NULL CHECK (fare_kes >= 0),
  employer_kes   INTEGER NOT NULL CHECK (employer_kes >= 0),
  employee_kes   INTEGER NOT NULL CHECK (employee_kes >= 0),
  pass_code      TEXT NOT NULL UNIQUE,      -- shown on the boarding pass
  status         TEXT NOT NULL DEFAULT 'booked'
                 CHECK (status IN ('booked','boarded','no_show','cancelled')),
  created_at     TEXT NOT NULL,
  boarded_at     TEXT,
  -- A seat is only reserved while the booking is live. Cancelled seats free up,
  -- which is why the uniqueness guard is a partial index rather than a constraint.
  CHECK (employer_kes + employee_kes = fare_kes)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_seat_live
  ON bookings(trip_id, seat_no) WHERE status IN ('booked','boarded');
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_one_per_trip
  ON bookings(trip_id, employee_id) WHERE status IN ('booked','boarded');
CREATE INDEX IF NOT EXISTS idx_bookings_employee ON bookings(employee_id);

-- Telemetry from the on-board tracker. Seeded trips get their position derived
-- from the schedule instead (see lib/domain/tracking.ts), so this table only
-- carries pings that a real device actually reported.
CREATE TABLE IF NOT EXISTS vehicle_pings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  speed_kph   REAL NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pings_trip ON vehicle_pings(trip_id, recorded_at DESC);

-- Actual arrival times, marked off by the driver as the run progresses. Where
-- one exists it beats the estimate: a stage that has been called is a fact,
-- not a prediction.
CREATE TABLE IF NOT EXISTS trip_stop_events (
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  stop_id    TEXT NOT NULL REFERENCES stops(id),
  arrived_at TEXT NOT NULL,
  PRIMARY KEY (trip_id, stop_id)
);

-- Anything that goes wrong on a run. Raised from the driver app or by control,
-- and cleared from the operations board.
CREATE TABLE IF NOT EXISTS incidents (
  id            TEXT PRIMARY KEY,
  trip_id       TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  reporter_kind TEXT NOT NULL CHECK (reporter_kind IN ('driver', 'operator')),
  reporter_id   TEXT NOT NULL,
  kind          TEXT NOT NULL
                CHECK (kind IN ('traffic','breakdown','accident','security','weather','other')),
  note          TEXT NOT NULL,
  delay_minutes INTEGER NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
  created_at    TEXT NOT NULL,
  resolved_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_incidents_trip ON incidents(trip_id);
CREATE INDEX IF NOT EXISTS idx_incidents_open ON incidents(created_at DESC) WHERE resolved_at IS NULL;
