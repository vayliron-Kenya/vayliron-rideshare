# Vayliron Shared Transportation

A corporate bus line for Nairobi, as four applications over one network:

| Surface | Who it is for | Where |
| --- | --- | --- |
| **Rider app** | Commuters | `/dashboard`, `/book`, `/bookings`, `/track` |
| **Driver app** | Drivers, mobile-first | `/drive` |
| **Client control panel** | HR and finance at a client company | `/company` |
| **Vayliron control panel** | The people running the network | `/ops` |

One sign-in serves all four — where you land depends on who the email belongs
to. Eight lines, 44 stages, Monday to Saturday.

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

Sign in with any seeded email — the seed prints a set when it finishes:

| Account | Lands on | Role |
| --- | --- | --- |
| `naliaka.wekesa@vayliron.co.ke` | `/ops` | Network admin — can also edit the fleet, network and client contracts |
| `daniel.mutiso@vayliron.co.ke` | `/ops` | Controller — runs the daily board |
| `peter.mwangi@vayliron.co.ke` | `/drive` | Driver |
| `wanjiku.karanja@tandaza.co.ke` | `/dashboard` | Rider + HR admin, Tandaza Bank (100% subsidy, uncapped) |
| `brenda.atieno@zurihealth.co.ke` | `/dashboard` | Rider + HR admin, Zuri Health (75% subsidy, KSh 4,500/month cap) |
| `joseph.kariuki@maralogistics.co.ke` | `/dashboard` | Rider + HR admin, Mara Logistics (50% subsidy, KSh 3,000/month cap) |
| `otieno.odhiambo@tandaza.co.ke` | `/dashboard` | Rider only |

`npm run db:reset` wipes and rebuilds. The seed is driven by a fixed PRNG seed,
so the same network comes back every time.

## The four apps

### Rider

The rider screens are deliberately plainer than the rest of the app. A commuter
is standing at a stage in the dark, often on a cheap phone, sometimes handing it
to a child to read the time, and not necessarily reading English quickly. So
those screens follow three rules: one obvious thing to do per screen as a
full-width button; touch targets of at least 56px; and labels you would say out
loud — "Where do you get on?", not "Boarding stage". Icons always accompany a
word rather than replacing it, and no state is signalled by colour alone.

Booking is three questions asked one at a time, each collapsing to a single line
with a Change link once answered, so there is never more than one decision on
screen. Arriving from your own commute answers the first two, leaving one tap.

`/dashboard` shows the next trip with a live countdown and boarding pass,
month-to-date spend, and departures that serve both their home stage and their
workplace — rolling forward to the next day with buses on it rather than showing
an empty list at 6pm. `/book/[trip]` prices the leg before they commit and lets
them pick a seat off a 2+2 map. `/bookings` holds the pass codes, flags a run
that control has put behind schedule, and cancels a seat back onto sale.
`/track/[trip]` draws the corridor from real coordinates and moves the bus along
it.

### Driver

Built for a phone held at a stage. `/drive` is the day's roster with month-to-date
runs, riders carried and on-time rate. `/drive/[trip]` is the run itself: open
boarding, start the run, check riders in by pass code, call each stage as it is
reached, report a delay against fixed buttons, raise an incident straight to
control, and close the run out. A driver can only open runs they are rostered on;
a controller can open any of them to cover the door.

### Client control panel

`/company` reports employer spend against the subsidy policy, adoption against
headcount, attendance against no-shows, and an indicative CO₂e figure.
`/company/people` adds, edits and deactivates staff — deactivating releases any
seat they hold on a future departure. `/company/policy` sets the employer share,
the monthly per-employee cap and the billing address, with a live table of what
each fare zone will cost staff. `/company/invoices` is the monthly bill with a
line per rider and a CSV export. `/company/activity` is their own slice of the
audit trail — their admins' changes, plus anything Vayliron did to their
account.

### Vayliron control panel

`/ops` is the live network board: load, fare revenue, delayed runs and open
incidents, with a per-line rollup and what is on the road right now.
`/ops/trips` filters every departure by day, line, state and direction.
`/ops/trips/[trip]` is where a controller intervenes — put a run behind
schedule, swap the bus or the driver, cancel it with a reason, or resolve an
incident. `/ops/fleet` and `/ops/clients` cover utilisation and revenue;
`/ops/audit` is the network-wide trail of who changed what; `/ops/network`
(network admins only) suspends lines and adds stages.

## Brand

The palette is taken from vayliron.com rather than eyeballed, and the site
takes some reading. Its stylesheet ships a teal-green default that the live
page then overrides in an inline `:root` block:

```css
:root {
  --primary-color:  201, 71, 255;   /* #C947FF */
  --secondary-color:  1,  1,  52;   /* #010134 */
}
```

So the brand is purple on deep indigo, not the green in the vendor defaults.
The supporting values — `#792B99` solid buttons, `#0D0030` headings, the
`#E9B3FF` and `#F2D2FF` tints, the `#ECB238` / `#FF8367` / `#47A1E5` status
trio and the neutral ramp — come from the same stylesheet.

Two deliberate departures, both about legibility rather than taste:

- **Accent text uses `#792B99`, not `#C947FF`.** The vivid primary only reaches
  3:1 on white. That is fine for a fill or a logo, and this app sets route
  codes and highlights in it, so light mode uses the deep purple for type and
  keeps the vivid one for fills and graphics. Dark mode can afford the bright
  tint and uses it.
- **Status colours are darkened for light mode.** `#ECB238` and `#47A1E5` work
  as fills on vayliron.com but fail as small text on a tinted background, which
  is how badges here use them. The raw values are kept as `-vivid` tokens for
  meters and graphics, and dark mode restores them everywhere.

The site is light-first with a `.dark` class, so this app is light by default.
The theme control in the header has three states — light, dark, and follow the
system — and a pinned choice is applied before first paint so it never flashes
the wrong one. Every colour lives in `app/globals.css`; no component hard-codes
one.

The control panels do **not** follow those rules. A controller triaging a
morning peak and a finance admin reconciling an invoice need density — sortable
tables, many numbers in view at once — and making those screens childlike would
make them worse at their job. They inherit the palette and the type scale, and
stop there.

**Gilmer** is Vayliron's typeface. It is commercially licensed, so it is
declared first in the font stack and used wherever an installation has it,
with a system stack behind it rather than a bundled lookalike.

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

**The audit trail** takes an `Actor` as a required argument on every
administrative write, so an unattributed change is a compile error rather than
something a future caller forgets. It is scoped on purpose: cancelling a run,
moving a bus, editing the subsidy, adding or removing staff. Boardings and
rider bookings are not duplicated into it — a boarding already has
`bookings.boarded_at`, and burying twenty real entries under fourteen thousand
routine ones makes the trail useless. Actor and subject names are stored as
they read at the time, so the record still says "Naliaka Wekesa cancelled VL-01
06:00" after the person leaves and the departure is purged. A cancellation that
affects a client's riders is written twice — once for the network log, once
scoped to that client — so each side sees it from their own angle. Audit writes
never throw into the caller: a full disk must not take the network down with
it.

**Delays** are a first-class property of a departure, not a note. A driver or
controller reports minutes; every downstream arrival time, rider ETA and tracked
position shifts by them. Incidents compound — two on one run add up — and the
total is clamped at four hours. Calling a stage recalculates the delay from the
actual arrival, but only once the run has actually departed: tapping ahead on a
bus still sitting at the depot must not erase a delay somebody reported.

## Layout

```
app/
  page.tsx                 landing + sign-in for all four surfaces
  dashboard/ book/ bookings/ track/   rider app
  routes/[slug]/           timetable, stage list, departures
  drive/[tripId]/          driver app
  company/{people,policy,invoices,activity}/  client control panel
  ops/{trips,fleet,clients,audit,network}/    Vayliron control panel
  api/trips/[tripId]/position         polling endpoint for the map
  api/company/invoice.csv             invoice export
  actions.ts               rider server actions
  drive-actions.ts         driver and door server actions
  company-actions.ts       client-admin server actions
  ops-actions.ts           network control server actions
lib/
  domain/                  pure logic — fares, schedule, seats, tracking, geo, time
  data/nairobi.ts          stops, lines, fleet, drivers, clients, Vayliron staff
  queries.ts               what a rider can read and do
  ops.ts                   what staff can read and do
  audit.ts                 who changed what
  schema.sql               SQLite schema
  auth.ts                  multi-principal session (rider / driver / controller)
tests/                     vitest suites over the domain, booking and operations
scripts/seed.ts            network generator
scripts/smoke.ts           browser end-to-end run across all four surfaces
```

Everything that decides a number lives in `lib/domain` as a pure function, which
is why the test suite can cover fares, caps, peak factors, direction reversal,
seat allocation and tracking without touching a database.

## Tests

```bash
npm test          # 123 unit and integration tests
npm run typecheck
npm run build
```

The suite covers the domain functions and drives the real paths against a
throwaway SQLite file: overselling, double-booking, seat races, cancellation
freeing a seat, monthly caps biting mid-month, pass codes refused twice, a
cancelled run releasing every seat, a replacement bus too small for the riders
already on it, delays compounding and clamping, off-domain staff emails, what a
monthly invoice does and does not bill, and the audit trail — including that a
cancellation does not leak to a client with nobody on board, and that a failed
audit write does not roll back the change it was describing.

Server actions never run under `vitest`, so there is a browser pass for those:

```bash
npm run db:reset
npm run build && npm start &
npm run smoke     # screenshots land in .smoke/
```

There is also a capture script behind `npm run preview`, which photographs a
curated set of screens — the rider and driver at phone width, the two control
panels at desktop width — and `scripts/build-preview-page.py` folds them into a
single self-contained walkthrough page.

The smoke run walks all four surfaces in one session: signs in as a rider and books a seat,
reads the issued pass code and opens the live map, switches to the HR hat to add
a member of staff and pull an invoice, signs in as a controller to put that exact
run ten minutes behind, works the door with the pass code, calls a stage, then
signs back in as the rider to confirm they were told their bus is late — and
finally opens the driver app at phone width — checking along the way that the
audit trail names the controller who applied the delay, and that the client's
own activity log shows the change their admin made.

## Before this touches real staff data

- **Sign-in is a demo.** `lib/auth.ts` accepts a known email with no password,
  no OTP and no SSO. The session cookie is HMAC-signed and `httpOnly` and the
  three directories are separate, so only the identity check needs replacing —
  swap `signIn` for your identity provider and the rest of the module stands.
- **The audit trail is append-only by convention, not by enforcement.** Nothing
  in the app deletes or edits an entry, but a database user with write access
  could. Real deployments should move it to append-only storage, or ship it off
  the box, before it is evidence in a dispute.
- **Editing a line's stages is deliberately not exposed.** Reordering stops or
  changing distances repricess live bookings, so `/ops/network` can suspend a
  line and add a stage but not rewire one. Lines live in `lib/data/nairobi.ts`.
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
