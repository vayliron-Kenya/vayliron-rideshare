/**
 * End-to-end smoke test against a running server.
 *
 *   npm run db:reset
 *   npm run build && npm start &
 *   npm run smoke
 *
 * Drives the flows that server actions own — signing in, booking a bus,
 * delaying a run from control, checking a rider in at the door — because none
 * of those run under `vitest`. Screenshots land in `.smoke/`.
 */
import fs from "node:fs";
import path from "node:path";

import { chromium, type Page } from "playwright";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const SHOTS = path.join(process.cwd(), ".smoke");

const RIDER = "wanjiku.karanja@tandaza.co.ke"; // also an HR admin
const CONTROLLER = "naliaka.wekesa@vayliron.co.ke"; // network admin

const checks: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
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
    await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  }
  await page.fill("#email", email);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**${expectPath}`, { timeout: 15000 });
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  /* ---------------------------------------------------------------- *
   * Rider
   * ---------------------------------------------------------------- */

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(SHOTS, "01-landing.png"), fullPage: true });
  check("landing page renders", await page.getByText("Thika Road Express").first().isVisible());

  await signIn(page, RIDER, "/dashboard");
  check("a rider email opens the rider app", page.url().includes("/dashboard"));
  await page.screenshot({ path: path.join(SHOTS, "02-dashboard.png"), fullPage: true });

  // Matched by destination, not by label: the rider screens use big plain-language
  // rows rather than a button that literally says "Book".
  await page.goto(`${BASE}/ride`, { waitUntil: "networkidle" });
  const bookLink = () => page.locator('a[href^="/book/"]').first();
  const onRideTab = (await bookLink().count()) > 0;
  if (!onRideTab) {
    await page.goto(`${BASE}/routes/mombasa-road-express`, { waitUntil: "networkidle" });
  }
  const hasDeparture = (await bookLink().count()) > 0;
  check(
    "a bookable departure is offered",
    hasDeparture,
    onRideTab ? "from the rider's own commute" : "from the routes page",
  );
  if (!hasDeparture) throw new Error("nothing bookable — reseed with `npm run db:reset`");

  await bookLink().click();
  await page.waitForURL("**/book/**", { timeout: 15000 });

  // Both ends of the journey are answered before the screen renders, so the
  // fare and the one button are all that is waiting.
  check(
    "the fare is spelled out before booking",
    await page.getByText("You pay").first().isVisible(),
  );
  check(
    "no seat picker is offered on a city bus",
    (await page.locator('button[aria-label^="Seat "]').count()) === 0,
  );
  await page.screenshot({ path: path.join(SHOTS, "03-booking.png"), fullPage: true });

  await page.getByRole("button", { name: /Get on this bus/ }).click();
  await page.waitForURL("**/bookings**", { timeout: 15000 });
  check("confirming a booking lands on the rider's trips", page.url().includes("/bookings"));

  const bookingId = new URL(page.url()).searchParams.get("highlight") ?? "";
  const row = page.locator(`[data-booking-id="${bookingId}"]`);
  const passCode = ((await row.getAttribute("data-pass-code")) ?? "").trim();
  const tripId = (await row.getAttribute("data-trip-id")) ?? "";
  check(
    "a boarding pass code was issued",
    /^[2-9BCDFGHJKLMNPQRSTVWXYZ]{6}$/.test(passCode),
    passCode,
  );
  await page.screenshot({ path: path.join(SHOTS, "04-bookings.png"), fullPage: true });

  await row.getByRole("link", { name: /Where is my bus\?/ }).click();
  await page.waitForURL("**/track/**", { timeout: 15000 });
  check("live map renders the corridor", (await page.locator("svg polyline").count()) > 0);
  await page.screenshot({ path: path.join(SHOTS, "05-tracking.png"), fullPage: true });

  /* ---------------------------------------------------------------- *
   * Client control panel — the same person, wearing their HR hat
   * ---------------------------------------------------------------- */

  await page.goto(`${BASE}/company`, { waitUntil: "networkidle" });
  check("client panel reports employer spend", await page.getByText("Employer spend").first().isVisible());
  await page.screenshot({ path: path.join(SHOTS, "06-company.png"), fullPage: true });

  await page.goto(`${BASE}/company/people`, { waitUntil: "networkidle" });
  const stamp = Date.now().toString().slice(-6);
  await page.fill('input[name="name"]', "Smoke Testworker");
  await page.fill('input[name="email"]', `smoke.${stamp}@tandaza.co.ke`);
  await page.fill('input[name="phone"]', "+254712345678");
  await page.fill('input[name="staffNo"]', `SM-${stamp}`);
  await page.getByRole("button", { name: "Add to account" }).click();
  await page.waitForSelector("[data-form-result]", { timeout: 15000 });
  const addResult = await page.locator("[data-form-result]").first().innerText();
  check("HR can add a rider to the account", addResult.includes("can now sign in"), addResult.trim());
  await page.screenshot({ path: path.join(SHOTS, "07-company-people.png"), fullPage: true });

  await page.goto(`${BASE}/company/people`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', `outsider.${stamp}@gmail.com`);
  await page.fill('input[name="name"]', "Wrong Domain");
  await page.fill('input[name="phone"]', "+254712345678");
  await page.fill('input[name="staffNo"]', `SM-${stamp}b`);
  await page.getByRole("button", { name: "Add to account" }).click();
  await page.waitForSelector('[data-form-result="error"]', { timeout: 15000 });
  const domainError = await page.locator('[data-form-result="error"]').first().innerText();
  check(
    "an off-domain work email is refused",
    domainError.includes("tandaza.co.ke"),
    domainError.trim(),
  );

  await page.goto(`${BASE}/company/invoices`, { waitUntil: "networkidle" });
  check("invoice renders with a total", await page.getByText("Amount due").first().isVisible());
  await page.screenshot({ path: path.join(SHOTS, "08-company-invoice.png"), fullPage: true });

  /* ---------------------------------------------------------------- *
   * Vayliron control
   * ---------------------------------------------------------------- */

  await signIn(page, CONTROLLER, "/ops");
  check("a Vayliron email opens the operations board", page.url().includes("/ops"));
  await page.screenshot({ path: path.join(SHOTS, "09-ops-board.png"), fullPage: true });

  await page.goto(`${BASE}/ops/trips/${tripId}`, { waitUntil: "networkidle" });
  check("control sees the manifest for the rider's departure", await page.getByText("Manifest").first().isVisible());

  // Delay the run by 10 minutes and confirm the rider is told.
  await page.getByRole("button", { name: "+10", exact: true }).click();
  const delayed = await page
    .getByText("running 10 min late")
    .first()
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check("control can put a run behind schedule", delayed);
  await page.screenshot({ path: path.join(SHOTS, "10-ops-trip.png"), fullPage: true });

  // The delay must be attributed to the controller who applied it.
  await page.goto(`${BASE}/ops/audit`, { waitUntil: "networkidle" });
  const auditNamesController = await page.getByText("Naliaka Wekesa").count();
  check("the audit trail names who made the change", auditNamesController > 0);
  await page.screenshot({ path: path.join(SHOTS, "16-ops-audit.png"), fullPage: true });

  await page.goto(`${BASE}/ops/fleet`, { waitUntil: "networkidle" });
  check("fleet and roster render", await page.getByText("Fleet & roster").first().isVisible());
  await page.screenshot({ path: path.join(SHOTS, "11-ops-fleet.png"), fullPage: true });

  await page.goto(`${BASE}/ops/clients`, { waitUntil: "networkidle" });
  check("client revenue renders", await page.getByText("Fare revenue").first().isVisible());
  await page.screenshot({ path: path.join(SHOTS, "12-ops-clients.png"), fullPage: true });

  /* ---------------------------------------------------------------- *
   * The door — control covering it, then the driver's own view
   * ---------------------------------------------------------------- */

  await page.goto(`${BASE}/drive/${tripId}`, { waitUntil: "networkidle" });
  // The run is four tabs now — checking someone in lives under Riders.
  const openTab = async (name: string) => {
    await page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
    await page.waitForTimeout(250);
  };
  await openTab("Riders");
  await page.fill("#passCode", passCode);
  await page.getByRole("button", { name: "Board", exact: true }).click();
  // Scoped to the form's own banner: Next.js renders an empty role="alert"
  // route announcer on every page, which would otherwise match first.
  await page.waitForSelector("[data-board-result]", { timeout: 15000 });
  const banner = await page.locator("[data-board-result]").first().innerText();
  check("the door accepts the pass code", banner.includes("is on"), banner.trim());
  await page.screenshot({ path: path.join(SHOTS, "13-door.png"), fullPage: true });

  await page.fill("#passCode", passCode);
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.waitForSelector('[data-board-result="error"]', { timeout: 15000 });
  const second = await page.locator('[data-board-result="error"]').first().innerText();
  check("the same pass is refused a second time", second.includes("already been scanned"), second.trim());

  // Call a stage, which is how a run reports its own progress.
  await openTab("Line");
  const arrived = page.getByRole("button", { name: "Arrived" }).first();
  if ((await arrived.count()) > 0) {
    await arrived.click();
    const called = await page
      .getByText(/called \d{2}:\d{2}/)
      .first()
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    check("calling a stage records the arrival", called);
  }

  /* ---------------------------------------------------------------- *
   * Back to the rider: did the delay reach them?
   * ---------------------------------------------------------------- */

  await signIn(page, RIDER, "/dashboard");
  // Highlighted so the delayed booking is the ticket at the top of the tab.
  await page.goto(`${BASE}/bookings?highlight=${bookingId}`, { waitUntil: "networkidle" });
  const riderSeesDelay = await page
    .locator(`[data-booking-id="${bookingId}"]`)
    .getByText(/minutes late/)
    .count();
  check("the rider is told their bus is running late", riderSeesDelay > 0);
  await page.screenshot({ path: path.join(SHOTS, "14-rider-delay.png"), fullPage: true });

  // HR sees their own admin change attributed to them, in their own log.
  await page.goto(`${BASE}/company/activity`, { waitUntil: "networkidle" });
  const clientSeesOwnChange = await page.getByText(/Added Smoke Testworker/).count();
  check("the client's activity log shows their own change", clientSeesOwnChange > 0);
  await page.screenshot({ path: path.join(SHOTS, "17-company-activity.png"), fullPage: true });

  /* ---------------------------------------------------------------- *
   * Driver app
   * ---------------------------------------------------------------- */

  const driverEmail = process.env.SMOKE_DRIVER_EMAIL ?? "peter.mwangi@vayliron.co.ke";
  await signIn(page, driverEmail, "/drive");
  check("a driver email opens the driver app", page.url().includes("/drive"));
  await page.setViewportSize({ width: 430, height: 932 });
  await page.reload({ waitUntil: "networkidle" });
  check("driver app fits a phone", (await page.locator("body").boundingBox())!.width <= 430);
  await page.screenshot({ path: path.join(SHOTS, "15-driver-phone.png"), fullPage: true });

  /* ---------------------------------------------------------------- *
   * Dark mode — vayliron.com ships one, so this app follows the system
   * ---------------------------------------------------------------- */

  const darkCtx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
  });
  const darkPage = await darkCtx.newPage();
  await darkPage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await darkPage.fill("#email", RIDER);
  await darkPage.click('button[type="submit"]');
  await darkPage.waitForURL("**/dashboard", { timeout: 15000 });

  const bodyBg = await darkPage.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  // The light palette paints on white; the dark one on deep indigo.
  const isDark = !bodyBg.includes("255, 255, 255");
  check("dark mode follows the system setting", isDark, bodyBg);
  await darkPage.screenshot({ path: path.join(SHOTS, "18-dark-mode.png"), fullPage: true });
  await darkCtx.close();

  await browser.close();

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  console.log(`screenshots in ${SHOTS}`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
