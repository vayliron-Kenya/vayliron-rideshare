# Vayliron Shared Transportation

A shared bus network for Nairobi, as five applications over one network — on
buses Vayliron does not own.

| Surface | Who it is for | Where |
| --- | --- | --- |
| **Rider app** | Commuters, phone-first | `/dashboard`, `/routes`, `/pay` |
| **Driver app** | Drivers, phone-first | `/drive` |
| **Owner panel** | Whoever owns the bus — a SACCO or one person | `/fleet` |
| **Client control panel** | HR and finance at a client company | `/company` |
| **Vayliron control panel** | The people running the network | `/ops` |

One sign-in serves all five — where you land depends on who the email belongs
to. Eight lines, 44 stops, Monday to Saturday.

Nairobi's public transport is privately owned, and the model here follows that:
an owner submits a vehicle with photographs, Vayliron approves it or does not,
and every fare it then carries is split between the two. Nothing Vayliron has
not approved can be rostered.

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
| `joseph.kamau@kasaranistar.co.ke` | `/fleet` | Bus owner — Kasarani Star SACCO, ten units |
| `mary.achieng@gmail.com` | `/fleet` | Bus owner — one person, one matatu |

`npm run db:reset` wipes and rebuilds. The seed is driven by a fixed PRNG seed,
so the same network comes back every time.

## The five apps

### Rider

Three tabs and genuinely nothing else, because a rider on a Nairobi bus wants
three things: where their bus is and how close it is getting, which buses are
out, and what they owe.

| Tab | Answers |
| --- | --- |
| **My bus** (`/dashboard`) | How long until it reaches me |
| **Buses** (`/routes`) | Which lines have a bus moving right now |
| **Pay** (`/pay`) | What do I owe, and what have I paid |

The shell is the viewport. A fixed header, a floating tab dock, and a panel in
between that each tab is built to fill exactly — the page itself never scrolls
up or down, you switch tabs instead. Screens reached *from* a tab (the live map,
the account, booking) are ordinary documents and scroll inside the panel.

**My bus** puts the countdown at the size of the phone and spends the rest of
the panel on the line itself: your two stops bright, the ones between dimmed,
and the rail filling in as the bus works toward you. A countdown says how long;
that says how close, which is the thing people actually crane their necks for.

There is **no seat to pick** — these are city buses. Getting on is the journey,
the price and one button; either end can be changed, which swaps the card for a
single list of stops. Capacity is still exact: each booking takes the lowest
free internal place, guarded by a partial unique index, and that number is never
shown to anyone. How full a bus is appears as a phrase — "Lots of room",
"Filling up", "Nearly full" — because "37 of 49" is a sum you have to do while a
bus is pulling in.

**Pay** raises the charge the moment a place is taken, not at the door: the bus
owner is owed for the place whether or not the rider turns up. Where an employer
covers the whole fare there is no push to anyone's phone and the method says so.

The account — month-to-date spend, the two stops on file, the theme control,
sign-out — lives behind the profile button in the header, so it never competes
with a bus for a thumb.

### Driver

Built for one hand at a stop before dawn, on the same fixed-height shell.
`/drive` is the day's roster with month-to-date runs, riders carried and on-time
rate. `/drive/[trip]` is the run itself, cut into four tabs — working a bus is
four separate jobs and a driver only ever does one of them at a time:

| Tab | What it is for |
| --- | --- |
| **Now** | Hold or go, in the largest type on the screen, with the next pick-up and set-down under it |
| **Riders** | Check someone in with the six characters off their phone |
| **Line** | Every other bus on the corridor, plotted on the same strip |
| **Report** | One form to control; minutes added here change what riders see |

The corridor strip exists because bunching — three buses nose to tail and then a
twenty-minute hole — is invisible in a list of departure times and obvious the
moment the buses are drawn on the same line.

The cue follows the clock, not the status flag: a driver who taps "set off"
early leaves a run marked in transit while the bus is standing at the terminus,
and the answer there is still "hold", not "next stop in 686 minutes".

A driver can only open runs they are rostered on; a controller can open any of
them to cover the door.

### Owner panel

Vayliron does not own the fleet. `/fleet` is the account of whoever does — a
SACCO pooling a few dozen vehicles under one route licence, or one person with a
bank loan and a matatu.

It leads with the money, then lists each unit with the one thing that is true
about it right now: carrying riders, sitting with Vayliron, or waiting on the
owner. `/fleet/add` asks only what decides whether a bus can work a route —
plate, make, body type, capacity. Everything subjective about a vehicle is
settled by four photographs on `/fleet/[vehicle]`: the bus from outside, down
the aisle, the plate, and the logbook. Those are the things an owner would
describe generously and a controller has to see.

`/fleet/earnings` shows two numbers that are not the same number — what riders
paid on their buses, and what they keep after commission — with the split
spelled out between them, by bus and by day.

Photographs are logbooks and number plates, so they are served from
`/api/vehicle-photos/[id]`, which checks the viewer is either Vayliron staff or
the owner who uploaded them. They are not public files.

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
(network admins only) suspends lines and adds stops.

`/ops/approvals` is the gate. A vehicle carries nobody until somebody here has
looked at it, so the four photographs *are* the page rather than thumbnails in a
table row, with two buttons under them. A rejection has to carry a reason, and
the owner reads that exact sentence on their own screen — being told no with no
reason leaves nothing to fix. The board carries a count of what is waiting.

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
The theme control has three states — light, dark, and follow the system — and a
pinned choice is applied before first paint so it never flashes the wrong one.
Every colour lives in `app/globals.css`; no component hard-codes one.

The two phone surfaces are **glass over an aurora**. Two soft lamps of brand
colour drift behind everything, fixed to the viewport rather than the page, and
every surface above them is translucent with a hairline of light along its top
edge. The colour showing through one card is never quite the colour showing
through the next, which is what makes a flat rectangle read as a pane with a
thickness. The depth is doing the work — no colour was added to the brand to get
there.

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

**Every fare is split** the moment the money moves, between the owner of the bus
that carried the rider and Vayliron's commission for the network, the app and
the payments. The owner's share is floored and the remainder goes to the
network, so the two halves always reconstruct what was paid — `payments`
enforces that as a `CHECK`. The split is *stored* rather than recomputed from
the current rate, because changing an owner's rate next month must not restate
last month.

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
  layout.tsx               the shell — fixed height on phones, flowing on desktop
  page.tsx                 landing + sign-in for all five surfaces
  dashboard/ routes/ pay/  the rider's three tabs
  book/ bookings/ track/ ride/  screens reached from a tab
  drive/[tripId]/          driver app — four tabs on one screen
  fleet/{add,earnings,[vehicleId]}/  bus owner panel
  company/{people,policy,invoices,activity}/  client control panel
  ops/{trips,approvals,fleet,clients,audit,network}/  Vayliron control panel
  api/trips/[tripId]/position         polling endpoint for the map
  api/vehicle-photos/[photoId]        authenticated photo route
  api/company/invoice.csv             invoice export
  actions.ts               rider server actions, including paying a fare
  drive-actions.ts         driver and door server actions
  fleet-actions.ts         owner server actions — add, photograph, submit
  company-actions.ts       client-admin server actions
  ops-actions.ts           network control, including approve and reject
lib/
  domain/                  pure logic — fares, payments, schedule, boarding,
                           tracking, geo, time
  data/nairobi.ts          stops, lines, fleet, owners, drivers, clients, staff
  queries.ts               what a rider can read and do
  ops.ts                   what network staff can read and do
  owners.ts                the fleet: submitting a bus, and HQ's verdict
  dispatch.ts              what a driver needs in the next sixty seconds
  commute.ts               the departures useful to one commuter
  audit.ts                 who changed what
  schema.sql               SQLite schema
  auth.ts                  four-principal session (rider / driver / owner / controller)
components/rider.tsx       the rider's glass vocabulary
components/run-tabs.tsx    the driver's four tabs
tests/                     vitest suites over the domain, booking and operations
scripts/seed.ts            network generator
scripts/smoke.ts           browser end-to-end run across every surface
```

Everything that decides a number lives in `lib/domain` as a pure function, which
is why the test suite can cover fares, caps, peak factors, direction reversal,
capacity, the owner/network split and tracking without touching a database.

## Tests

```bash
npm test          # 166 unit and integration tests, 8 suites
npm run typecheck
npm run build
```

The suite covers the domain functions and drives the real paths against a
throwaway SQLite file: overselling, double-booking, races for the last place,
cancellation freeing it again, monthly caps biting mid-month, pass codes refused
twice, a cancelled run releasing every booking, a replacement bus too small for
the riders already aboard (and gaps being closed so a smaller one still fits),
delays compounding and clamping, off-domain staff emails, what a monthly invoice
does and does not bill, the owner/network split always reconstructing the fare,
Kenyan phone numbers in all the shapes people type them, a fare that cannot be
paid twice or paid by somebody else, whether a driver should hold or go, and the
audit trail — including that a cancellation does not leak to a client with
nobody on board, and that a failed audit write does not roll back the change it
was describing.

Server actions never run under `vitest`, so there is a browser pass for those:

```bash
npm run db:reset
npm run build && npm start &
npm run smoke     # 26 checks; screenshots land in .smoke/
```

There is also a capture script behind `npm run preview`, which photographs a
curated set of screens — the rider and driver at phone width, the two control
panels at desktop width — and `scripts/build-preview-page.py` folds them into a
single self-contained walkthrough page.

The smoke run walks every surface in one session: signs in as a rider and books a seat,
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
  changing distances reprices live bookings, so `/ops/network` can suspend a
  line and add a stop but not rewire one. Lines live in `lib/data/nairobi.ts`.
- **SQLite is a single-node store.** The booking path is transactional and the
  capacity and one-per-departure guards are partial unique indexes, so two
  riders cannot take the last place on one node — but it will not survive being
  scaled out. Point it at Postgres before it does.
- **M-Pesa is arithmetic, not Safaricom.** There are no Daraja credentials, so
  no STK push leaves the box: `settlePayment` writes the receipt the callback
  would have carried, in the same shape, and every screen that shows one says
  where it came from. The split, the ledger and the owner payout figures are all
  real; only the transport is missing.
- **Vehicle photographs sit on local disk** under `data/vehicle-photos`, served
  through an authenticated route. Object storage is the right home before this
  holds anyone's logbook.
- **The CO₂e figure is indicative**, from a flat 160 g/passenger-km difference.
  Do not put it in an audited disclosure without a real methodology.

## Stack

Next.js 15 (App Router, server components, server actions) · React 19 ·
TypeScript · Tailwind CSS v4 · SQLite via better-sqlite3 · Vitest · Playwright.
No mapping library and no charting library — the corridor map and the spend
chart are hand-rolled SVG, which keeps the client bundle at ~103 kB shared. The
glass, the aurora and the fixed-height shell are plain CSS in
`app/globals.css`; there is no UI kit under any of it.
