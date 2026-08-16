import type { Metadata, Viewport } from "next";

import { AppNav } from "@/components/app-nav";
import { RiderTabs } from "@/components/rider-tabs";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { displayName, displayOrg, getPrincipal } from "@/lib/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vayliron Shared Transportation — corporate bus line for Nairobi",
    template: "%s · Vayliron Shared Transportation",
  },
  description:
    "Scheduled staff shuttles across Nairobi: book a seat, track the bus, and give HR a live view of spend and utilisation.",
};

export const viewport: Viewport = {
  // Vayliron's brand purple, so the mobile browser chrome matches the app.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0022" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const principal = await getPrincipal();
  const rider = principal?.kind === "employee";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies a pinned theme before first paint, so it never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <AppNav
          kind={principal?.kind ?? null}
          name={principal ? displayName(principal) : ""}
          org={principal ? displayOrg(principal) : ""}
          isCompanyAdmin={principal?.kind === "employee" && principal.employee.role === "admin"}
          isNetworkAdmin={principal?.kind === "operator" && principal.operator.role === "superadmin"}
        />
        <main
          className={`mx-auto w-full px-4 pt-5 sm:px-6 ${
            rider ? "max-w-lg pb-28" : "max-w-6xl pb-24"
          }`}
        >
          {children}
        </main>

        {rider ? (
          <RiderTabs />
        ) : (
          <footer className="border-t border-line px-4 py-8 text-center text-xs text-faint sm:px-6">
            Vayliron Shared Transportation · Vayliron Mobility Ltd, Upper Hill, Nairobi · All times
            East Africa Time (UTC+3)
          </footer>
        )}
      </body>
    </html>
  );
}
