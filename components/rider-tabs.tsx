"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PinIcon, RouteIcon, TicketIcon } from "@/components/icons";

/**
 * The rider's whole app, three tabs wide.
 *
 * A rider on a Nairobi bus wants three things and genuinely nothing else:
 * where their bus is and how close it is getting, which lines are running, and
 * what they owe. So there are three tabs, not a menu:
 *
 *   Track  — where is my bus, and how long until it reaches me?
 *   Routes — which lines are alive right now, and can I get on one?
 *   Pay    — what do I owe, and what have I paid?
 *
 * Anything about the account — spend, home and work stages, signing out —
 * lives behind the profile button in the header, so it never competes with a
 * bus for a thumb. The bar sits at the bottom because that is where a thumb
 * is, and clears the phone's home indicator with `env(safe-area-inset-bottom)`.
 */

const TABS = [
  { href: "/dashboard", label: "Track", Icon: PinIcon },
  { href: "/routes", label: "Routes", Icon: RouteIcon },
  { href: "/pay", label: "Pay", Icon: TicketIcon },
] as const;

/** Sub-pages belong to the tab they were opened from. */
const OWNED_BY: Record<string, string> = {
  "/track": "/dashboard",
  "/bookings": "/dashboard",
  "/book": "/routes",
  "/ride": "/routes",
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
