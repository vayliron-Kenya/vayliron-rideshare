"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/app/actions";
import { ThemeToggle } from "@/components/theme-toggle";

export interface NavProps {
  kind: "employee" | "driver" | "operator" | "owner" | null;
  name: string;
  org: string;
  /** Company admins get the client control panel; controllers get the ops one. */
  isCompanyAdmin: boolean;
  isNetworkAdmin: boolean;
}

interface NavLink {
  href: string;
  label: string;
}

function linksFor(props: NavProps): NavLink[] {
  if (props.kind === "operator") {
    const links: NavLink[] = [
      { href: "/ops", label: "Board" },
      { href: "/ops/trips", label: "Departures" },
      { href: "/ops/fleet", label: "Fleet" },
      { href: "/ops/clients", label: "Clients" },
      { href: "/ops/audit", label: "Audit" },
    ];
    if (props.isNetworkAdmin) links.push({ href: "/ops/network", label: "Network" });
    return links;
  }

  if (props.kind === "driver") {
    return [{ href: "/drive", label: "My runs" }];
  }

  if (props.kind === "owner") {
    return [
      { href: "/fleet", label: "My buses" },
      { href: "/fleet/earnings", label: "Earnings" },
    ];
  }

  // Riders navigate from the bottom tab bar, so the top of their screen stays
  // empty — one navigation system per surface, not two disagreeing ones.
  return [];
}

const AREA_LABEL: Record<string, string> = {
  operator: "Control",
  driver: "Driver",
  owner: "Fleet",
  employee: "",
};

export function AppNav(props: NavProps) {
  const pathname = usePathname();
  const links = linksFor(props);
  const area = props.kind ? AREA_LABEL[props.kind] : "";
  const rider = props.kind === "employee";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link
          href={rider ? "/dashboard" : (links[0]?.href ?? "/")}
          className="flex shrink-0 items-center gap-2.5"
        >
          <Mark />
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-sm font-semibold tracking-tight text-body">Vayliron</span>
            <span className="hidden text-sm text-muted lg:inline">Shared Transportation</span>
          </span>
          {area ? (
            <span className="hidden rounded-md bg-raised px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted sm:inline">
              {area}
            </span>
          ) : null}
        </Link>

        {links.length > 0 ? (
          <nav className="ml-1 flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {links.map((link) => {
              // "/ops" would otherwise light up for every page beneath it.
              const active =
                pathname === link.href ||
                (link.href !== "/ops" && pathname.startsWith(`${link.href}/`));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-raised font-medium text-body"
                      : "text-muted hover:bg-raised/60 hover:text-body"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {/* Riders get the theme control on their Me tab, not in the chrome. */}
          {rider ? null : <ThemeToggle />}
          {rider ? null : props.kind ? (
            <>
              <div className="hidden text-right sm:block">
                <p className="text-xs font-medium text-body">{props.name}</p>
                <p className="text-[11px] text-faint">{props.org}</p>
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted transition-colors hover:border-flame/60 hover:text-flame"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/"
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand transition-colors hover:bg-brand-hover"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 28 28" className="size-7 shrink-0" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="26"
        height="26"
        rx="8"
        className="fill-brand-soft stroke-brand"
        strokeWidth="1.2"
      />
      <rect x="7" y="8" width="14" height="10" rx="2.5" className="fill-brand" />
      <rect x="8.6" y="9.6" width="4.6" height="3.6" rx="1" className="fill-brand-soft" />
      <rect x="14.8" y="9.6" width="4.6" height="3.6" rx="1" className="fill-brand-soft" />
      <circle cx="10.4" cy="20" r="1.9" className="fill-brand-bright" />
      <circle cx="17.6" cy="20" r="1.9" className="fill-brand-bright" />
    </svg>
  );
}
