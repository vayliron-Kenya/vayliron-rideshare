import type { Metadata, Viewport } from "next";

import { AppNav } from "@/components/app-nav";
import { displayName, displayOrg, getPrincipal } from "@/lib/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Vayliron — corporate bus line for Nairobi",
    template: "%s · Vayliron",
  },
  description:
    "Scheduled staff shuttles across Nairobi: book a seat, track the bus, and give HR a live view of spend and utilisation.",
};

export const viewport: Viewport = {
  themeColor: "#080b10",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const principal = await getPrincipal();

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AppNav
          kind={principal?.kind ?? null}
          name={principal ? displayName(principal) : ""}
          org={principal ? displayOrg(principal) : ""}
          isCompanyAdmin={principal?.kind === "employee" && principal.employee.role === "admin"}
          isNetworkAdmin={principal?.kind === "operator" && principal.operator.role === "superadmin"}
        />
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
        <footer className="border-t border-line px-4 py-8 text-center text-xs text-faint sm:px-6">
          Vayliron Mobility Ltd · Upper Hill, Nairobi · All times East Africa Time (UTC+3)
        </footer>
      </body>
    </html>
  );
}
