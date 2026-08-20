/**
 * Captures a curated set of screens for the visual walkthrough.
 *
 *   npm run build && npm start &
 *   npm run preview
 *
 * Unlike the smoke run, which photographs whatever state it happens to drive
 * the app into, this picks accounts that already have something worth showing
 * and shoots each surface at the width it is actually used on — a phone for
 * the rider and driver, a desktop for the two control panels.
 *
 * Output is JPEG rather than PNG so the whole set can be inlined into one
 * self-contained page.
 */
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { chromium, type Browser, type Page } from "playwright";

const BASE = process.env.PREVIEW_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), ".preview");

const PHONE = { width: 430, height: 932 };
const DESK = { width: 1280, height: 900 };

/** Screenshots of a sticky header repeat it down a full-page capture. */
const UNSTICK = "header{position:static !important}";

interface Shot {
  file: string;
  title: string;
  caption: string;
  device: "phone" | "desktop";
}

const shots: Shot[] = [];

async function capture(
  page: Page,
  file: string,
  title: string,
  caption: string,
  device: "phone" | "desktop",
) {
  await page.addStyleTag({ content: UNSTICK });
  await page.screenshot({
    path: path.join(OUT, file),
    fullPage: true,
    type: "jpeg",
    quality: 78,
  });
  shots.push({ file, title, caption, device });
  console.log(`  captured ${file}`);
}

async function signIn(page: Page, email: string, expectPath: string) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  if (!page.url().endsWith("/")) {
    // Already signed in as somebody else. Staff sign out from the top bar;
    // riders navigate from a tab bar, so theirs lives on the Me tab.
    if ((await page.getByRole("button", { name: "Sign out" }).count()) === 0) {
      await page.goto(`${BASE}/me`, { waitUntil: "networkidle" });
    }
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(`${BASE}/`, { timeout: 20000 });
  }
  await page.fill("#email", email);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**${expectPath}`, { timeout: 20000 });
}

/**
 * A rider worth photographing.
 *
 * Preference order, because the shots have to show the app doing something
 * rather than an empty state: someone riding a bus that is actually on the
 * road, then someone who also owes a fare, then anyone with a booking at all.
 */
function pickRiderWithBooking(): { email: string; tripId: string } {
  const db = new Database(path.join(process.cwd(), "data", "vayliron.db"), { readonly: true });

  const attempts = [
    // On a moving bus and owing money — every rider tab has real content.
    `SELECT e.email AS email, b.trip_id AS tripId
       FROM bookings b
       JOIN employees e ON e.id = b.employee_id
       JOIN trips t ON t.id = b.trip_id
       JOIN payments p ON p.booking_id = b.id
      WHERE b.status IN ('booked','boarded') AND t.status = 'in_transit'
        AND EXISTS (SELECT 1 FROM payments q JOIN bookings c ON c.id = q.booking_id
                     WHERE c.employee_id = e.id AND q.status = 'pending')
      LIMIT 1`,
    // On a moving bus.
    `SELECT e.email AS email, b.trip_id AS tripId
       FROM bookings b
       JOIN employees e ON e.id = b.employee_id
       JOIN trips t ON t.id = b.trip_id
      WHERE b.status IN ('booked','boarded') AND t.status = 'in_transit'
      LIMIT 1`,
    // Anything still to come.
    `SELECT e.email AS email, b.trip_id AS tripId
       FROM bookings b
       JOIN employees e ON e.id = b.employee_id
       JOIN trips t ON t.id = b.trip_id
      WHERE b.status = 'booked' AND t.status = 'scheduled'
      ORDER BY t.service_date, t.depart_time
      LIMIT 1`,
  ];

  for (const sql of attempts) {
    const row = db.prepare(sql).get() as { email: string; tripId: string } | undefined;
    if (row) {
      db.close();
      return row;
    }
  }

  db.close();
  throw new Error("no upcoming booking in the database — run `npm run db:reset`");
}

/** A departure with riders on it, so the manifest and door have something to show. */
function pickBusyTrip(): string {
  const db = new Database(path.join(process.cwd(), "data", "vayliron.db"), { readonly: true });
  const row = db
    .prepare(
      `SELECT t.id AS id, COUNT(b.id) AS sold
         FROM trips t
         JOIN bookings b ON b.trip_id = t.id AND b.status IN ('booked','boarded')
        WHERE t.status = 'scheduled'
        GROUP BY t.id
        ORDER BY sold DESC
        LIMIT 1`,
    )
    .get() as { id: string } | undefined;
  db.close();
  if (!row) throw new Error("no busy departure found — run `npm run db:reset`");
  return row.id;
}

/** An owner with a bus waiting on HQ, so both ends of the approval have something to show. */
function pickOwnerWithSubmission(): { email: string; vehicleId: string } {
  const db = new Database(path.join(process.cwd(), "data", "vayliron.db"), { readonly: true });
  const row = db
    .prepare(
      `SELECT o.email AS email, v.id AS vehicleId
         FROM vehicles v JOIN owners o ON o.id = v.owner_id
        WHERE v.status = 'pending'
        ORDER BY v.submitted_at
        LIMIT 1`,
    )
    .get() as { email: string; vehicleId: string } | undefined;
  db.close();
  if (!row) throw new Error("no bus is waiting on approval — run `npm run db:reset`");
  return row;
}

/** The driver rostered on a given departure, so their app is not empty. */
function driverFor(tripId: string): { email: string; serviceDate: string } {
  const db = new Database(path.join(process.cwd(), "data", "vayliron.db"), { readonly: true });
  const row = db
    .prepare(
      `SELECT d.email AS email, t.service_date AS serviceDate
         FROM trips t JOIN drivers d ON d.id = t.driver_id WHERE t.id = ?`,
    )
    .get(tripId) as { email: string; serviceDate: string };
  db.close();
  return row;
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const rider = pickRiderWithBooking();
  const busyTrip = pickBusyTrip();
  const driver = driverFor(busyTrip);
  const owner = pickOwnerWithSubmission();

  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? undefined,
  });

  /* ---- Landing, on a desktop ---- */
  const desk = await browser.newContext({ viewport: DESK });
  const deskPage = await desk.newPage();
  await deskPage.goto(BASE, { waitUntil: "networkidle" });
  await capture(
    deskPage,
    "01-landing.jpg",
    "Signing in",
    "One email for four apps. Where you land depends on who the address belongs to — a controller, a driver, an HR admin or a commuter.",
    "desktop",
  );

  /* ---- Rider, on a phone ---- */
  const phone = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
  const phonePage = await phone.newPage();

  await signIn(phonePage, rider.email, "/dashboard");
  await capture(
    phonePage,
    "02-rider-track.jpg",
    "Rider · My bus",
    "One question, one screen: how long until my bus gets here. The countdown is the biggest thing on the phone, and the rest of the panel is the line itself \u2014 your two stops bright, the ones between dimmed, and the rail filling in as the bus works toward you.",
    "phone",
  );

  await phonePage.goto(`${BASE}/routes`, { waitUntil: "networkidle" });
  await capture(
    phonePage,
    "03-rider-routes.jpg",
    "Rider · Buses",
    "Which buses are out. Anything actually moving carries a live dot and leads the list; lines that have finished for the day sink to the bottom rather than vanishing, because knowing the last one has gone is an answer too.",
    "phone",
  );

  await phonePage.goto(`${BASE}/pay`, { waitUntil: "networkidle" });
  await capture(
    phonePage,
    "04-rider-pay.jpg",
    "Rider · Pay",
    "What you owe, with the M-Pesa number under it and the receipts behind that. Fares go to the owner of the bus you rode, less Vayliron\u2019s commission \u2014 the split is made the moment the money moves and stored, so changing a rate next month never restates last month.",
    "phone",
  );

  await phonePage.goto(`${BASE}/track/${rider.tripId}`, { waitUntil: "networkidle" });
  await phonePage.waitForTimeout(600);
  await capture(
    phonePage,
    "05-rider-tracking.jpg",
    "Rider · Following the bus",
    "The corridor drawn from real Nairobi coordinates, with the bus on it and a countdown to every stage. Refreshes every 15 seconds.",
    "phone",
  );

  const anotherTrip = pickBusyTrip();
  await phonePage.goto(`${BASE}/book/${anotherTrip}`, { waitUntil: "networkidle" });
  await phonePage.waitForTimeout(400);
  await capture(
    phonePage,
    "06-rider-booking.jpg",
    "Rider · Getting on",
    "A city bus has no seat to pick, and this rider's two stages are already on file — so booking is the journey, the price, and one button. Either end can be changed, which swaps the card for a single list of stages.",
    "phone",
  );

  /* ---- Driver, on a phone ---- */
  await signIn(phonePage, driver.email, "/drive");
  await phonePage.goto(`${BASE}/drive?date=${driver.serviceDate}`, { waitUntil: "networkidle" });
  await capture(
    phonePage,
    "07-driver-runs.jpg",
    "Driver · My runs",
    "The day's roster with month-to-date runs, riders carried and on-time rate. Built for a phone held at a stage.",
    "phone",
  );

  await phonePage.goto(`${BASE}/drive/${busyTrip}`, { waitUntil: "networkidle" });
  // Open the tab that shows the line and the other buses on it.
  const lineTab = phonePage.getByRole("tab", { name: /^Line/ });
  if (await lineTab.count()) {
    await lineTab.click();
    await phonePage.waitForTimeout(400);
  }
  await capture(
    phonePage,
    "08-driver-run.jpg",
    "Driver · Working a run",
    "Four tabs, each one screen: whether to hold or go with the next pick-up and set-down under it, checking riders in by code, the line with every other bus on it drawn along the corridor, and one form to tell control what has gone wrong.",
    "phone",
  );

  /* ---- Bus owner, on a desktop ---- */
  await signIn(deskPage, owner.email, "/fleet");
  await capture(
    deskPage,
    "09-owner-fleet.jpg",
    "Bus owner · My buses",
    "Nairobi\u2019s buses are privately owned \u2014 a SACCO, or one person with a loan and a matatu. Vayliron runs the network they work on, so the owner signs in and sees the one thing that is true about each unit right now: carrying riders, sitting with Vayliron, or waiting on them for a photograph.",
    "desktop",
  );

  await deskPage.goto(`${BASE}/fleet/${owner.vehicleId}`, { waitUntil: "networkidle" });
  await capture(
    deskPage,
    "10-owner-bus.jpg",
    "Bus owner · One bus",
    "Four photographs are the page: the bus from outside, down the aisle, the plate, and the logbook. Everything subjective about a vehicle is what an owner would describe generously and a controller has to see, so it is settled here rather than in a form field.",
    "desktop",
  );

  await deskPage.goto(`${BASE}/fleet/earnings`, { waitUntil: "networkidle" });
  await capture(
    deskPage,
    "11-owner-earnings.jpg",
    "Bus owner · Earnings",
    "Two numbers matter and they are not the same number: what riders paid on their buses, and what the owner keeps after commission. Both are here with the split spelled out between them, broken down by bus and by day.",
    "desktop",
  );

  /* ---- HQ approving it ---- */
  await signIn(deskPage, "naliaka.wekesa@vayliron.co.ke", "/ops");
  await deskPage.goto(`${BASE}/ops/approvals`, { waitUntil: "networkidle" });
  await capture(
    deskPage,
    "12-ops-approvals.jpg",
    "Control · Buses waiting on us",
    "The gate. A vehicle carries nobody until somebody here has looked at it, so the photographs are the page rather than thumbnails in a table row. A rejection has to carry a reason, and the owner reads that exact sentence on their own screen \u2014 being told no with no reason leaves nothing to fix.",
    "desktop",
  );

  /* ---- Client control panel, on a desktop ---- */
  await signIn(deskPage, "wanjiku.karanja@tandaza.co.ke", "/dashboard");
  await deskPage.goto(`${BASE}/company`, { waitUntil: "networkidle" });
  await capture(
    deskPage,
    "13-company-overview.jpg",
    "Client panel · Overview",
    "What the employer is spending, how much of the headcount actually rides, attendance against no-shows, and utilisation line by line.",
    "desktop",
  );

  await deskPage.goto(`${BASE}/company/people`, { waitUntil: "networkidle" });
  await capture(
    deskPage,
    "14-company-people.jpg",
    "Client panel · People",
    "HR adds, edits and deactivates staff. Deactivating someone releases any seat they hold on a future departure rather than letting it run empty.",
    "desktop",
  );

  await deskPage.goto(`${BASE}/company/invoices`, { waitUntil: "networkidle" });
  await capture(
    deskPage,
    "15-company-invoice.jpg",
    "Client panel · Invoice",
    "The monthly bill, a line per rider, with a CSV export. Road passenger transport is VAT-exempt in Kenya, so no VAT line.",
    "desktop",
  );

  /* ---- Vayliron control, on a desktop ---- */
  await deskPage.goto(`${BASE}/ops`, { waitUntil: "networkidle" });
  await capture(
    deskPage,
    "16-ops-board.jpg",
    "Control · Network board",
    "Load, fare revenue, delayed runs and open incidents, with a per-line rollup and whatever is on the road right now.",
    "desktop",
  );

  await deskPage.goto(`${BASE}/ops/trips/${busyTrip}`, { waitUntil: "networkidle" });
  await capture(
    deskPage,
    "17-ops-trip.jpg",
    "Control · One departure",
    "Where a controller intervenes: delay the run, swap the bus or driver, or cancel it with a reason — which releases every booking on it.",
    "desktop",
  );

  await deskPage.goto(`${BASE}/ops/audit`, { waitUntil: "networkidle" });
  await capture(
    deskPage,
    "18-ops-audit.jpg",
    "Control · Audit trail",
    "Who changed what. Every administrative write takes an actor, so an unattributed change is a compile error rather than an omission.",
    "desktop",
  );

  /* ---- Dark theme ---- */
  const dark = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, colorScheme: "dark" });
  const darkPage = await dark.newPage();
  await signIn(darkPage, rider.email, "/dashboard");
  await capture(
    darkPage,
    "19-dark.jpg",
    "The dark theme",
    "Light by default, matching vayliron.com. The control on the Me tab pins light or dark, or follows the phone's own setting.",
    "phone",
  );

  await browser.close();

  fs.writeFileSync(path.join(OUT, "shots.json"), JSON.stringify(shots, null, 2));
  const bytes = shots.reduce((sum, s) => sum + fs.statSync(path.join(OUT, s.file)).size, 0);
  console.log(`\n${shots.length} screens, ${(bytes / 1024 / 1024).toFixed(2)} MB total`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
