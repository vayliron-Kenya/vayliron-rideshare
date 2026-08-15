/**
 * End-to-end smoke test against a running server.
 *
 *   npm run build && npm start &
 *   npm run smoke
 *
 * Drives the flows that server actions own — signing in, reserving a seat,
 * checking a rider in at the door — because those never run during `vitest`.
 * Screenshots land in `.smoke/` for a quick visual check.
 */
import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const SHOTS = path.join(process.cwd(), ".smoke");

const checks: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  // --- Sign in ------------------------------------------------------------
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(SHOTS, "01-landing.png"), fullPage: true });
  check("landing page renders", await page.getByText("Thika Road Express").first().isVisible());

  await page.fill("#email", "wanjiku.karanja@tandaza.co.ke");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  check("work email signs the rider in", page.url().includes("/dashboard"));
  await page.screenshot({ path: path.join(SHOTS, "02-dashboard.png"), fullPage: true });

  // --- Book a seat --------------------------------------------------------
  // `exact` matters: without it this also matches the "Booked" state link.
  const bookLink = () => page.getByRole("link", { name: "Book", exact: true }).first();

  // Re-running without reseeding eventually books out this rider's own
  // commute, so fall back to the wider network rather than calling it a failure.
  const onDashboard = (await bookLink().count()) > 0;
  if (!onDashboard) {
    await page.goto(`${BASE}/routes/mombasa-road-express`, { waitUntil: "networkidle" });
  }
  const hasDeparture = (await bookLink().count()) > 0;
  check(
    "a bookable departure is offered",
    hasDeparture,
    onDashboard ? "from the rider's own commute" : "from the routes page",
  );

  if (hasDeparture) {
    await bookLink().click();
    await page.waitForURL("**/book/**", { timeout: 15000 });
    await page.waitForSelector("#board");

    const fareBefore = await page.getByText(/You pay/).first().isVisible();
    check("fare quote is shown before booking", fareBefore);
    await page.screenshot({ path: path.join(SHOTS, "03-booking.png"), fullPage: true });

    // Pick an explicit seat rather than taking the auto-assigned one.
    const freeSeat = page.locator('button[aria-label^="Seat "]').first();
    const seatLabel = await freeSeat.getAttribute("aria-label");
    await freeSeat.click();

    await page.getByRole("button", { name: /Confirm seat/ }).click();
    await page.waitForURL("**/bookings**", { timeout: 15000 });
    check("confirming a seat lands on the rider's trips", page.url().includes("/bookings"), seatLabel ?? "");

    // Work from the booking that was just created, not whichever row sorts first.
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

    // --- Track it ---------------------------------------------------------
    await row.getByRole("link", { name: "Track" }).click();
    await page.waitForURL("**/track/**", { timeout: 15000 });
    check("live map renders the corridor", (await page.locator("svg polyline").count()) > 0);
    await page.screenshot({ path: path.join(SHOTS, "05-tracking.png"), fullPage: true });

    // --- Check the rider in at the door -----------------------------------
    if (tripId && passCode) {
      await page.goto(`${BASE}/driver/${tripId}`, { waitUntil: "networkidle" });
      await page.fill("#passCode", passCode);
      await page.getByRole("button", { name: "Board" }).click();
      // Scoped to the form's own banner: Next.js renders an empty role="alert"
      // route announcer on every page, which would otherwise match first.
      await page.waitForSelector("[data-board-result]", { timeout: 15000 });
      const banner = await page.locator("[data-board-result]").first().innerText();
      check("the door accepts the pass code", banner.includes("boarded at"), banner.trim());
      await page.screenshot({ path: path.join(SHOTS, "06-door.png"), fullPage: true });

      // The same pass must not work twice.
      await page.fill("#passCode", passCode);
      await page.getByRole("button", { name: "Board" }).click();
      await page.waitForSelector('[data-board-result="error"]', { timeout: 15000 });
      const second = await page.locator('[data-board-result="error"]').first().innerText();
      check("the same pass is refused a second time", second.includes("already been scanned"), second.trim());
    }
  }

  // --- Admin --------------------------------------------------------------
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  check("HR dashboard renders spend", await page.getByText("Employer spend").first().isVisible());
  await page.screenshot({ path: path.join(SHOTS, "07-admin.png"), fullPage: true });

  await page.goto(`${BASE}/routes`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(SHOTS, "08-routes.png"), fullPage: true });

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
