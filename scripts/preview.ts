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

/** A rider who already holds a seat on a departure that has not run yet. */
function pickRiderWithBooking(): { email: string; tripId: string } {
  const db = new Database(path.join(process.cwd(), "data", "vayliron.db"), { readonly: true });
  const row = db
    .prepare(
      `SELECT e.email AS email, b.trip_id AS tripId
         FROM bookings b
         JOIN employees e ON e.id = b.employee_id
         JOIN trips t ON t.id = b.trip_id
        WHERE b.status = 'booked' AND t.status = 'scheduled'
        ORDER BY t.service_date, t.depart_time
        LIMIT 1`,
    )
    .get() as { email: string; tripId: string } | undefined;
  db.close();
  if (!row) throw new Error("no upcoming booking in the database — run `npm run db:reset`");
  return row;
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
    "02-rider-now.jpg",
    "Rider · Now",
    "Tab one answers one question: when is my bus. The countdown is the biggest thing on the screen, then where to get on, then the code to show at the door — and one button to watch it approach.",
    "phone",
  );

  await phonePage.goto(`${BASE}/ride`, { waitUntil: "networkidle" });
  await capture(
    phonePage,
    "03-rider-ride.jpg",
    "Rider · Ride",
    "Only the departures that run between this rider's own two stages, grouped by direction. Each row carries the three things that decide it: when it leaves, what it costs after the employer's share, and how full it is — as a phrase, not a fraction.",
    "phone",
  );

  await phonePage.goto(`${BASE}/track/${rider.tripId}`, { waitUntil: "networkidle" });
  await phonePage.waitForTimeout(600);
  await capture(
    phonePage,
    "04-rider-tracking.jpg",
    "Rider · Where is my bus?",
    "The corridor drawn from real Nairobi coordinates, with the bus on it and a countdown to every stage. Refreshes every 15 seconds.",
    "phone",
  );

  const anotherTrip = pickBusyTrip();
  await phonePage.goto(`${BASE}/book/${anotherTrip}`, { waitUntil: "networkidle" });
  await phonePage.waitForTimeout(400);
  await capture(
    phonePage,
    "05-rider-booking.jpg",
    "Rider · Booking",
    "A city bus has no seat to pick, and this rider's two stages are already on file — so booking is the journey, the price, and one button. Either end can be changed, which swaps the card for a single list of stages.",
    "phone",
  );

  await phonePage.goto(`${BASE}/bookings`, { waitUntil: "networkidle" });
  await capture(
    phonePage,
    "06-rider-trips.jpg",
    "Rider · Trips",
    "The next bus is the ticket, with the pass code set large enough to read at arm's length. Everything under it is history.",
    "phone",
  );

  await phonePage.goto(`${BASE}/me`, { waitUntil: "networkidle" });
  await capture(
    phonePage,
    "07-rider-me.jpg",
    "Rider · Me",
    "What the month has cost, what the employer covered, and the two stages every suggestion in the app is built from. Sign-out and the theme control live here, so the other three tabs stay entirely about buses.",
    "phone",
  );

  /* ---- Driver, on a phone ---- */
  await signIn(phonePage, driver.email, "/drive");
  await phonePage.goto(`${BASE}/drive?date=${driver.serviceDate}`, { waitUntil: "networkidle" });
  await capture(
    phonePage,
    "08-driver-runs.jpg",
    "Driver · My runs",
    "The day's roster with month-to-date runs, riders carried and on-time rate. Built for a phone held at a stage.",
    "phone",
  );

  await phonePage.goto(`${BASE}/drive/${busyTrip}`, { waitUntil: "networkidle" });
  await capture(
    phonePage,
    "09-driver-run.jpg",
    "Driver · Working a run",
    "Open boarding, start the run, check riders in by pass code, call each stage, report a delay straight to control, then close out.",
    "phone",
  );

  /* ---- Client control panel, on a desktop ---- */
  await signIn(deskPage, "wanjiku.karanja@tandaza.co.ke", "/dashboard");
  await deskPage.goto(`${BASE}/company`, { waitUntil: "networkidle" });
  await capture(
    deskPage,
    "10-company-overview.jpg",
    "Client panel · Overview",
    "What the employer is spending, how much of the headcount actually rides, attendance against no-shows, and utilisation line by line.",
    "desktop",
  );

  await deskPage.goto(`${BASE}/company/people`, { waitUntil: "networkidle" });
  await capture(
    deskPage,
    "11-company-people.jpg",
    "Client panel · People",
    "HR adds, edits and deactivates staff. Deactivating someone releases any seat they hold on a future departure rather than letting it run empty.",
    "desktop",
  );

  await deskPage.goto(`${BASE}/company/invoices`, { waitUntil: "networkidle" });
  await capture(
    deskPage,
    "12-company-invoice.jpg",
    "Client panel · Invoice",
    "The monthly bill, a line per rider, with a CSV export. Road passenger transport is VAT-exempt in Kenya, so no VAT line.",
    "desktop",
  );

  /* ---- Vayliron control, on a desktop ---- */
  await signIn(deskPage, "naliaka.wekesa@vayliron.co.ke", "/ops");
  await capture(
    deskPage,
    "13-ops-board.jpg",
    "Control · Network board",
    "Load, fare revenue, delayed runs and open incidents, with a per-line rollup and whatever is on the road right now.",
    "desktop",
  );

  await deskPage.goto(`${BASE}/ops/trips/${busyTrip}`, { waitUntil: "networkidle" });
  await capture(
    deskPage,
    "14-ops-trip.jpg",
    "Control · One departure",
    "Where a controller intervenes: delay the run, swap the bus or driver, or cancel it with a reason — which releases every booking on it.",
    "desktop",
  );

  await deskPage.goto(`${BASE}/ops/audit`, { waitUntil: "networkidle" });
  await capture(
    deskPage,
    "15-ops-audit.jpg",
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
    "16-dark.jpg",
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
