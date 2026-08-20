"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PinIcon, RouteIcon, TicketIcon } from "@/components/icons";

/**
 * The rider's whole app, three tabs wide.
 *
 * A rider on a Nairobi bus wants three things and genuinely nothing else:
 * where their bus is and how close it is getting, which buses are running, and
 * what they owe. So there are three tabs, not a menu:
 *
 *   Where's my bus — how long until it reaches me?
 *   Buses         — which ones are out right now, and can I get on?
 *   Pay           — what do I owe, and what have I paid?
 *
 * The dock floats rather than sitting on a bar, because the panel above it is
 * a fixed-height screen and the aurora needs to keep running underneath. It
 * clears the phone's home indicator with `env(safe-area-inset-bottom)`.
 */

const TABS = [
  { href: "/dashboard", label: "My bus", Icon: PinIcon },
  { href: "/routes", label: "Buses", Icon: RouteIcon },
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
      className="shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
    >
      <ul className="glass mx-auto flex w-full max-w-lg items-stretch gap-1 rounded-[1.65rem] p-1.5">
        {TABS.map(({ href, label, Icon }) => {
          const current = active === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-[1.25rem] transition-all duration-200 ${
                  current
                    ? "brand-wash glow text-white"
                    : "text-muted hover:bg-[var(--glass-sheen)] hover:text-body"
                }`}
              >
                <Icon className="size-6" />
                <span className="text-[0.7rem] font-bold tracking-tight">{label}</span>
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
