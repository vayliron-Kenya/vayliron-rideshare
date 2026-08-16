"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BusIcon, PersonIcon, RouteIcon, TicketIcon } from "@/components/icons";

/**
 * The rider's whole app, four tabs wide.
 *
 * A commuter uses this standing up, one-handed, often while a bus is pulling
 * in. Scrolling to find the thing you opened the app for is the wrong shape
 * for that, so the rider surface is cut into four screens that each answer one
 * question, and the answer is always the first thing you see:
 *
 *   Now   — when is my bus and where is it?
 *   Ride  — book the next one.
 *   Trips — what have I booked, and what is my code?
 *   Me    — what has this cost, and what is on file about me?
 *
 * The bar sits at the bottom because that is where a thumb is, and it clears
 * the phone's home indicator with `env(safe-area-inset-bottom)`.
 */

const TABS = [
  { href: "/dashboard", label: "Now", Icon: BusIcon },
  { href: "/ride", label: "Ride", Icon: RouteIcon },
  { href: "/bookings", label: "Trips", Icon: TicketIcon },
  { href: "/me", label: "Me", Icon: PersonIcon },
] as const;

/** Sub-pages belong to the tab they were opened from. */
const OWNED_BY: Record<string, string> = {
  "/track": "/dashboard",
  "/book": "/ride",
  "/routes": "/ride",
  "/company": "/me",
};

export function RiderTabs() {
  const pathname = usePathname();
  const active = activeTab(pathname);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/92 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex w-full max-w-lg items-stretch">
        {TABS.map(({ href, label, Icon }) => {
          const current = active === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className="group flex min-h-16 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5"
              >
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                    current ? "brand-wash text-white" : "text-muted group-hover:bg-raised"
                  }`}
                >
                  <Icon className="size-6" />
                </span>
                <span
                  className={`text-xs font-semibold tracking-tight ${
                    current ? "text-accent" : "text-muted"
                  }`}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function activeTab(pathname: string): string {
  for (const [prefix, tab] of Object.entries(OWNED_BY)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return tab;
  }
  const exact = TABS.find((t) => t.href === pathname);
  return exact?.href ?? "/dashboard";
}
