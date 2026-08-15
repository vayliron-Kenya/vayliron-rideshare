"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/app/actions";
import type { Company, Employee } from "@/lib/types";

interface NavSession {
  employee: Employee;
  company: Company;
}

const LINKS = [
  { href: "/dashboard", label: "Today" },
  { href: "/routes", label: "Routes" },
  { href: "/bookings", label: "My trips" },
];

export function AppNav({ session }: { session: NavSession | null }) {
  const pathname = usePathname();

  const links = [...LINKS];
  if (session?.employee.role === "admin") {
    links.push({ href: "/admin", label: "Company" });
  }
  if (session) {
    links.push({ href: "/driver", label: "Door" });
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href={session ? "/dashboard" : "/"} className="flex items-center gap-2.5">
          <Mark />
          <span className="text-sm font-semibold tracking-tight text-body">Vayliron</span>
        </Link>

        {session ? (
          <nav className="ml-2 flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {links.map((link) => {
              const active =
                pathname === link.href || pathname.startsWith(`${link.href}/`);
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

        <div className="ml-auto flex items-center gap-3">
          {session ? (
            <>
              <div className="hidden text-right sm:block">
                <p className="text-xs font-medium text-body">{session.employee.name}</p>
                <p className="text-[11px] text-faint">{session.company.name}</p>
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
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-brand-bright"
            >
              Staff sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 28 28" className="size-7" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="8" fill="#0f2a22" stroke="#16a97a" strokeWidth="1.2" />
      <rect x="7" y="8" width="14" height="10" rx="2.5" fill="#16a97a" />
      <rect x="8.6" y="9.6" width="4.6" height="3.6" rx="1" fill="#0f2a22" />
      <rect x="14.8" y="9.6" width="4.6" height="3.6" rx="1" fill="#0f2a22" />
      <circle cx="10.4" cy="20" r="1.9" fill="#34d8a2" />
      <circle cx="17.6" cy="20" r="1.9" fill="#34d8a2" />
    </svg>
  );
}
