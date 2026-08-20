import type { Metadata, Viewport } from "next";

import { AppNav } from "@/components/app-nav";
import { RiderTabs } from "@/components/rider-tabs";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { displayName, displayOrg, getPrincipal } from "@/lib/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vayliron Shared Transportation — the bus network for Nairobi",
    template: "%s · Vayliron",
  },
  description:
    "See which buses are running, watch yours come to you, and pay for the ride. Drivers work the door from a phone, bus owners put their vehicles on the network, and Vayliron keeps it moving.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f2fd" },
    { media: "(prefers-color-scheme: dark)", color: "#06001a" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const principal = await getPrincipal();

  // The rider app is a fixed-height shell: three tabs, each exactly one screen,
  // and the page itself never scrolls. Staff surfaces are documents you read
  // top to bottom, so they keep the ordinary flowing layout.
  const rider = principal?.kind === "employee";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies a pinned theme before first paint, so it never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`font-sans antialiased ${rider ? "app-shell" : ""}`}>
        {/* Everything above is translucent; this is the colour it lets through. */}
        <div className="aurora" aria-hidden="true" />

        <AppNav
          kind={principal?.kind ?? null}
          name={principal ? displayName(principal) : ""}
          org={principal ? displayOrg(principal) : ""}
          isCompanyAdmin={principal?.kind === "employee" && principal.employee.role === "admin"}
          isNetworkAdmin={principal?.kind === "operator" && principal.operator.role === "superadmin"}
        />

        {rider ? (
          <>
            <main className="app-panel mx-auto w-full max-w-lg px-4 pt-3">{children}</main>
            <RiderTabs />
          </>
        ) : (
          <>
            <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-5 sm:px-6">{children}</main>
            <footer className="border-t border-line px-4 py-8 text-center text-xs text-faint sm:px-6">
              Vayliron Shared Transportation · Vayliron Mobility Ltd, Upper Hill, Nairobi · All
              times East Africa Time (UTC+3)
            </footer>
          </>
        )}
      </body>
    </html>
  );
}
