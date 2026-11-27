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

-- Nairobi's bus network is privately owned: a SACCO or a single person buys a
-- matatu or a coach and puts it on a route. Vayliron does not own the fleet, it
-- runs the network the fleet works on — so an owner is a first-class account
-- who submits vehicles and gets paid, not a string in a column.
CREATE TABLE IF NOT EXISTS owners (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,               -- trading name, or the person's name
  kind         TEXT NOT NULL DEFAULT 'individual'
               CHECK (kind IN ('individual', 'sacco', 'company')),
  contact_name TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,        -- how they sign in
  phone        TEXT NOT NULL,               -- +2547.., where payouts go
  kra_pin      TEXT NOT NULL,
  -- Share of each fare the owner keeps, in basis points. The rest is Vayliron's
  -- commission for carrying the network, the app and the payments.
  payout_bps   INTEGER NOT NULL DEFAULT 8500 CHECK (payout_bps BETWEEN 0 AND 10000),
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id        TEXT PRIMARY KEY,
  plate     TEXT NOT NULL UNIQUE,
  model     TEXT NOT NULL,
  capacity  INTEGER NOT NULL CHECK (capacity > 0),
  wifi      INTEGER NOT NULL DEFAULT 0,
  usb_ports INTEGER NOT NULL DEFAULT 0,
  operator  TEXT NOT NULL,
  -- Who owns the metal. Null only for the units Vayliron runs itself.
  owner_id  TEXT REFERENCES owners(id),
  body_type TEXT NOT NULL DEFAULT 'bus'
            CHECK (body_type IN ('matatu', 'minibus', 'bus', 'coach')),
  -- A vehicle cannot carry anyone until HQ has looked at the photos and said
  -- yes. Everything downstream keys off this, so it is not a nullable flag.
  status    TEXT NOT NULL DEFAULT 'approved'
            CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'suspended')),
  submitted_at TEXT,
  reviewed_at  TEXT,
  reviewed_by  TEXT,                        -- operator name, as it read that day
  review_note  TEXT                         -- why it was rejected, in plain words
);

CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON vehicles(owner_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_pending ON vehicles(submitted_at) WHERE status = 'pending';

-- HQ approves a bus by looking at it. Four angles, because a plate photo alone
-- proves nothing about whether the inside is fit to carry people.
CREATE TABLE IF NOT EXISTS vehicle_photos (
  id          TEXT PRIMARY KEY,
  vehicle_id  TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  angle       TEXT NOT NULL
              CHECK (angle IN ('exterior', 'interior', 'plate', 'logbook')),
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL CHECK (bytes > 0),
  filename    TEXT NOT NULL,                -- on disk, under data/vehicle-photos
  uploaded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicle_photos ON vehicle_photos(vehicle_id);

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

-- What the rider actually paid, and where it went.
--
-- Kept apart from the booking because they answer different questions and fail
-- independently: a booking is a place on a bus, a payment is money moving. An
-- M-Pesa push can be pending while the rider is already aboard.
CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY,
  booking_id   TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  method       TEXT NOT NULL CHECK (method IN ('mpesa', 'cash', 'employer')),
  phone        TEXT,                        -- the number the STK push went to
  amount_kes   INTEGER NOT NULL CHECK (amount_kes >= 0),
  -- Split of amount_kes at the moment it was taken, so a later change to the
  -- owner's rate never rewrites history.
  owner_kes    INTEGER NOT NULL DEFAULT 0 CHECK (owner_kes >= 0),
  network_kes  INTEGER NOT NULL DEFAULT 0 CHECK (network_kes >= 0),
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'paid', 'failed')),
  reference    TEXT,                        -- M-Pesa receipt, e.g. SJK4XR9QW1
  created_at   TEXT NOT NULL,
  settled_at   TEXT,
  CHECK (owner_kes + network_kes = amount_kes)
);

CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, created_at DESC);

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

-- Who changed what.
--
-- Scoped deliberately to administrative actions — cancelling a run, moving a
-- bus, editing the subsidy, adding or removing staff. High-volume domain
-- events are not duplicated here: a boarding already has `bookings.boarded_at`
-- and a rider's own booking is the booking row itself, so logging those would
-- bury the handful of entries anyone will ever need to find.
--
-- Actor and subject names are stored as they read at the time. A trail that
-- says "Naliaka Wekesa cancelled VL-01 06:00" must keep saying that after the
-- person leaves and the departure is purged.
CREATE TABLE IF NOT EXISTS audit_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  at            TEXT NOT NULL,
  actor_kind    TEXT NOT NULL
                CHECK (actor_kind IN ('employee', 'driver', 'operator', 'owner', 'system')),
  actor_id      TEXT NOT NULL,
  actor_name    TEXT NOT NULL,
  action        TEXT NOT NULL,               -- dotted verb, e.g. "trip.cancel"
  subject_kind  TEXT NOT NULL,               -- trip | employee | company | ...
  subject_id    TEXT NOT NULL,
  subject_label TEXT NOT NULL,
  summary       TEXT NOT NULL,               -- one line, already written for a human
  detail        TEXT,                        -- optional JSON: what changed
  -- Set when the entry belongs in a client's own view of their account.
  company_id    TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_events(at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_events(subject_kind, subject_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_events(company_id, at DESC);

-- ==================================================================
-- Chama — community savings, rotation, lending and welfare groups
-- ==================================================================
--
-- A chama's members are people who already have a Vayliron sign-in — a rider,
-- a driver, a bus owner or a member of staff — so a member is keyed by the
-- principal they sign in as ("employee:emp_12"), not by a new account table.
--
-- Money is integer minor units of the group's own currency. The app is the
-- group's book, not a wallet: it holds no funds. Money moves on M-Pesa, a bank
-- or in cash at a meeting, and every movement is recorded here against the
-- reference that rail issued, by one officer and confirmed by another.

CREATE TABLE IF NOT EXISTS chamas (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  category           TEXT NOT NULL,
  country            TEXT NOT NULL DEFAULT 'KE',
  currency           TEXT NOT NULL DEFAULT 'KES',
  visibility         TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  invite_code        TEXT NOT NULL UNIQUE,
  min_members        INTEGER NOT NULL CHECK (min_members >= 2),
  max_members        INTEGER NOT NULL CHECK (max_members >= min_members AND max_members <= 500),
  entry_fee_minor    INTEGER NOT NULL DEFAULT 0 CHECK (entry_fee_minor >= 0),
  contribution_minor INTEGER NOT NULL CHECK (contribution_minor > 0),
  frequency          TEXT NOT NULL CHECK (frequency IN ('weekly', 'fortnightly', 'monthly')),
  anchor_date        TEXT NOT NULL,           -- first contribution due date, YYYY-MM-DD
  grace_days         INTEGER NOT NULL DEFAULT 3 CHECK (grace_days BETWEEN 0 AND 30),
  late_fee_minor     INTEGER NOT NULL DEFAULT 0 CHECK (late_fee_minor >= 0),
  -- No one officer releases money: at least two signatures, always.
  approvals_required INTEGER NOT NULL DEFAULT 2 CHECK (approvals_required >= 2),
  reserve_bps        INTEGER NOT NULL DEFAULT 1000 CHECK (reserve_bps BETWEEN 0 AND 10000),
  loan_rate_bps      INTEGER NOT NULL DEFAULT 100 CHECK (loan_rate_bps BETWEEN 0 AND 1000),
  loan_multiple_tenths INTEGER NOT NULL DEFAULT 30 CHECK (loan_multiple_tenths BETWEEN 0 AND 100),
  quorum_bps         INTEGER NOT NULL DEFAULT 5000 CHECK (quorum_bps BETWEEN 1 AND 10000),
  threshold_bps      INTEGER NOT NULL DEFAULT 6667 CHECK (threshold_bps BETWEEN 5001 AND 10000),
  status             TEXT NOT NULL DEFAULT 'forming' CHECK (status IN ('forming', 'active', 'dissolved')),
  created_by         TEXT NOT NULL,
  created_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chama_members (
  chama_id         TEXT NOT NULL REFERENCES chamas(id) ON DELETE CASCADE,
  member_key       TEXT NOT NULL,            -- "<principal kind>:<id>"
  name             TEXT NOT NULL,
  role             TEXT NOT NULL DEFAULT 'member'
                   CHECK (role IN ('chairperson', 'treasurer', 'secretary', 'loan_officer', 'auditor', 'member')),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exited')),
  joined_on        TEXT NOT NULL,            -- YYYY-MM-DD, decides the first contribution owed
  payout_position  INTEGER,                  -- place in a merry-go-round queue
  acknowledged_version INTEGER NOT NULL,     -- the constitution version they accepted
  PRIMARY KEY (chama_id, member_key)
);
CREATE INDEX IF NOT EXISTS idx_chama_members_key ON chama_members(member_key);

-- Every version is kept. An amendment adds a row; nothing rewrites one.
CREATE TABLE IF NOT EXISTS chama_constitutions (
  chama_id   TEXT NOT NULL REFERENCES chamas(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  body       TEXT NOT NULL,
  adopted_at TEXT NOT NULL,
  adopted_by TEXT NOT NULL,                 -- a member key, or "vote:<proposal id>"
  PRIMARY KEY (chama_id, version)
);

-- A payment a member says they made, waiting for a second officer.
CREATE TABLE IF NOT EXISTS chama_receipts (
  id           TEXT PRIMARY KEY,
  chama_id     TEXT NOT NULL REFERENCES chamas(id) ON DELETE CASCADE,
  member_key   TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('contribution', 'entry_fee', 'late_fee', 'loan_repayment')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  rail         TEXT NOT NULL CHECK (rail IN ('mpesa', 'bank', 'cash')),
  reference    TEXT NOT NULL,               -- M-Pesa code, bank slip, meeting minute ref
  loan_id      TEXT,
  submitted_by TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  decided_by   TEXT,
  decided_at   TEXT,
  note         TEXT,
  -- The same M-Pesa code cannot be counted twice in one group.
  UNIQUE (chama_id, rail, reference)
);

-- Money out: a payout, a loan or a withdrawal. Never executed on one say-so.
CREATE TABLE IF NOT EXISTS chama_requests (
  id            TEXT PRIMARY KEY,
  chama_id      TEXT NOT NULL REFERENCES chamas(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('payout', 'loan', 'withdrawal', 'welfare')),
  beneficiary   TEXT NOT NULL,
  amount_minor  INTEGER NOT NULL CHECK (amount_minor > 0),
  reason        TEXT NOT NULL,
  round         INTEGER,                    -- the merry-go-round round a payout settles
  loan_rate_bps INTEGER,
  loan_months   INTEGER,
  requested_by  TEXT NOT NULL,
  requested_at  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'withdrawn')),
  executed_by   TEXT,
  executed_at   TEXT,
  rail          TEXT CHECK (rail IN ('mpesa', 'bank', 'cash')),
  reference     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chama_round_payout
  ON chama_requests(chama_id, round) WHERE kind = 'payout' AND status NOT IN ('rejected', 'withdrawn');

CREATE TABLE IF NOT EXISTS chama_approvals (
  request_id TEXT NOT NULL REFERENCES chama_requests(id) ON DELETE CASCADE,
  approver   TEXT NOT NULL,
  decision   TEXT NOT NULL CHECK (decision IN ('approve', 'reject')),
  at         TEXT NOT NULL,
  PRIMARY KEY (request_id, approver)
);

-- The group's books. Written only when a second person has confirmed the
-- money moved, and never changed afterwards: a correction is a new entry.
CREATE TABLE IF NOT EXISTS chama_ledger (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  chama_id     TEXT NOT NULL REFERENCES chamas(id),
  member_key   TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN (
                 'contribution', 'entry_fee', 'late_fee', 'loan_repayment',
                 'payout', 'loan_disbursement', 'withdrawal', 'welfare')),
  direction    TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  rail         TEXT NOT NULL,
  reference    TEXT NOT NULL,
  source_id    TEXT NOT NULL,               -- the receipt or request it settles
  loan_id      TEXT,
  recorded_by  TEXT NOT NULL,
  confirmed_by TEXT NOT NULL CHECK (confirmed_by <> recorded_by),
  at           TEXT NOT NULL,
  UNIQUE (source_id)
);
CREATE INDEX IF NOT EXISTS idx_chama_ledger ON chama_ledger(chama_id, member_key, at);

CREATE TRIGGER IF NOT EXISTS chama_ledger_no_update
  BEFORE UPDATE ON chama_ledger
  BEGIN SELECT RAISE(ABORT, 'chama ledger entries are append-only'); END;
CREATE TRIGGER IF NOT EXISTS chama_ledger_no_delete
  BEFORE DELETE ON chama_ledger
  BEGIN SELECT RAISE(ABORT, 'chama ledger entries are append-only'); END;

CREATE TABLE IF NOT EXISTS chama_proposals (
  id             TEXT PRIMARY KEY,
  chama_id       TEXT NOT NULL REFERENCES chamas(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('general', 'amendment')),
  amendment_body TEXT,
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  closes_at      TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'carried', 'defeated', 'no_quorum')),
  closed_at      TEXT
);

CREATE TABLE IF NOT EXISTS chama_votes (
  proposal_id TEXT NOT NULL REFERENCES chama_proposals(id) ON DELETE CASCADE,
  member_key  TEXT NOT NULL,
  choice      TEXT NOT NULL CHECK (choice IN ('yes', 'no', 'abstain')),
  at          TEXT NOT NULL,
  PRIMARY KEY (proposal_id, member_key)
);

CREATE TABLE IF NOT EXISTS chama_announcements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chama_id    TEXT NOT NULL REFERENCES chamas(id) ON DELETE CASCADE,
  author_key  TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body        TEXT NOT NULL,
  at          TEXT NOT NULL
);
