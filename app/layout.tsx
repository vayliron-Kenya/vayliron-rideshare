import type { Metadata, Viewport } from "next";

import { AppNav } from "@/components/app-nav";
import { getSession } from "@/lib/auth";

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
  const session = await getSession();

  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AppNav session={session} />
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
        <footer className="border-t border-line px-4 py-8 text-center text-xs text-faint sm:px-6">
          Vayliron Mobility Ltd · Upper Hill, Nairobi · All times East Africa Time (UTC+3)
        </footer>
      </body>
    </html>
  );
}
