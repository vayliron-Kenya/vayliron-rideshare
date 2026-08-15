# Vayliron

A corporate bus line for Nairobi. Employers put their staff on scheduled
shuttles; staff reserve a numbered seat, watch the bus approach their stage and
board with a six-character pass; HR and finance get utilisation, spend and a
per-employee split they can actually put through payroll.

Eight lines, 44 stages, Monday to Saturday.

```
VL-01  Thika Road Express        Juja · Ruiru · Roysambu · CBD · Upper Hill
VL-02  Mombasa Road Express      Athi River EPZ · Syokimau · South B · Upper Hill
VL-03  Ngong Road & Karen Link   Ngong · Karen · Yaya · Upper Hill
VL-04  Waiyaki Way Corridor      Kikuyu · Kinoo · Kangemi · Westlands · CBD
VL-05  Gigiri Diplomatic Line    Ruaka · Two Rivers · Gigiri · Westlands
VL-06  Eastlands Connector       Umoja · Donholm · Jogoo Road · CBD · Upper Hill
VL-07  Rongai · Lang'ata Line    Ongata Rongai · Lang'ata · Nairobi West · Upper Hill
VL-08  JKIA Staff Shuttle        Umoja · Donholm · Embakasi · JKIA
```

## Running it

```bash
npm install
npm run db:seed     # builds a full network with ~40 service days of history
npm run dev         # http://localhost:3000
```

Sign in with any seeded work email — the seed prints a few when it finishes:

| Account | Role |
| --- | --- |
| `wanjiku.karanja@tandaza.co.ke` | HR admin, Tandaza Bank (100% subsidy, uncapped) |
| `brenda.atieno@zurihealth.co.ke` | HR admin, Zuri Health Group (75% subsidy, KSh 4,500/month cap) |
| `joseph.kariuki@maralogistics.co.ke` | HR admin, Mara Logistics (50% subsidy, KSh 3,000/month cap) |
| `otieno.odhiambo@tandaza.co.ke` | Rider |

`npm run db:reset` wipes and rebuilds. The seed is driven by a fixed PRNG seed,
so the same network comes back every time.

## What is in it

**For the rider** — `/dashboard` shows the next trip with a live countdown and
boarding pass, month-to-date spend, and departures that serve both their home
stage and their workplace. `/book/[trip]` prices the leg before they commit and
lets them pick a seat off a 2+2 seat map. `/bookings` holds the pass codes and
cancels a seat back onto sale. `/track/[trip]` draws the corridor from real
coordinates and moves the bus along it.

**For HR and finance** — `/admin` reports employer spend against the subsidy
policy, adoption against headcount, attendance against no-shows, line-by-line
utilisation, per-employee payroll deductions and an indicative CO₂e figure.

**For the door** — `/driver` lists the day's departures; `/driver/[trip]` is the
manifest, grouped by boarding stage, with a pass-code box that refocuses itself
after every scan and a "close the run" action that marks the stragglers as
no-shows.

## How the numbers work

**Fares** are distance bands, not a per-kilometre rate — five predictable
numbers are far easier for HR to budget against, and a rider can tell what a leg
costs before booking. Charged on the distance actually travelled on the line,
not the length of the line.

| Zone | Distance | Fare |
| --- | --- | --- |
| A | up to 8 km | KSh 150 |
| B | 8–15 km | KSh 220 |
| C | 15–25 km | KSh 300 |
| D | 25–40 km | KSh 400 |
| E | over 40 km | KSh 500 |

**The employer split** is a basis-point share of each fare with an optional
monthly ceiling per employee. The employer's share is floored, never rounded, so
the two halves always reconstruct the fare exactly — the `bookings` table
enforces that as a `CHECK` constraint. Once an employee exhausts the monthly
allowance, the balance moves to them and the booking screen says so.

**Timetables** are free-flow durations scaled by a peak factor for the departure
time (×1.10 off-peak up to ×1.75 between 07:30 and 09:00). A 07:00 departure off
Thika Road is not the same trip as the same bus at 05:30, and quoting one
arrival time for both is how a shuttle service loses its riders.

**Tracking** prefers a live GPS ping and falls back to the timetable when no
tracker has reported in the last three minutes — so a scheduled bus still shows
a moving, honest estimate instead of an empty map.

## Layout

```
app/
  page.tsx                 landing + staff sign-in
  dashboard/               rider home
  routes/[slug]/           timetable, stage list, departures
  book/[tripId]/           seat map and fare quote
  bookings/                boarding passes and history
  track/[tripId]/          live position
  admin/                   HR and finance reporting
  driver/[tripId]/         manifest and door check-in
  api/trips/[tripId]/position  polling endpoint for the map
  actions.ts               server actions (sign in, book, cancel, board, close)
lib/
  domain/                  pure logic — fares, schedule, seats, tracking, geo, time
  data/nairobi.ts          stops, lines, fleet, drivers, clients
  queries.ts               every database read and write
  schema.sql               SQLite schema
  auth.ts                  session cookie
tests/                     vitest suites over the domain and the booking flow
scripts/seed.ts            network generator
scripts/smoke.ts           browser end-to-end run
```

Everything that decides a number lives in `lib/domain` as a pure function, which
is why the test suite can cover fares, caps, peak factors, direction reversal,
seat allocation and tracking without touching a database.

## Tests

```bash
npm test          # 83 unit and integration tests
npm run typecheck
npm run build
```

The suite covers the domain functions and drives the real booking path against a
throwaway SQLite file: overselling, double-booking, seat races, cancellation
freeing a seat, monthly caps biting mid-month, pass codes being refused twice,
and the reporting aggregates.

Server actions never run under `vitest`, so there is a browser pass for those:

```bash
npm run db:reset
npm run build && npm start &
npm run smoke     # screenshots land in .smoke/
```

It signs in, books a seat, reads the issued pass code, opens the live map, checks
the rider in at the door, and confirms the same pass is refused a second time.

## Before this touches real staff data

- **Sign-in is a demo.** `lib/auth.ts` accepts a known work email with no
  password, no OTP and no SSO. The session cookie itself is HMAC-signed and
  `httpOnly`, so only the identity check needs replacing — swap `signIn` for
  your identity provider and the rest of the module stands.
- **`/driver` is open to any signed-in user.** Real deployments should gate it
  on the `driver` role (already in the schema) or a separate device login.
- **SQLite is a single-node store.** The booking path is transactional and the
  seat and one-per-departure guards are partial unique indexes, so it is correct
  under concurrency on one node — but it will not survive being scaled out.
  Point it at Postgres before it does.
- **Payments are not implemented.** Employers are invoiced monthly and staff
  contributions are described as payroll deductions; there is no M-Pesa
  integration behind that, only the arithmetic.
- **The CO₂e figure is indicative**, from a flat 160 g/passenger-km difference.
  Do not put it in an audited disclosure without a real methodology.

## Stack

Next.js 15 (App Router, server components, server actions) · React 19 ·
TypeScript · Tailwind CSS v4 · SQLite via better-sqlite3 · Vitest · Playwright.
No mapping library and no charting library — the corridor map and the spend
chart are hand-rolled SVG, which keeps the client bundle at ~103 kB shared.
