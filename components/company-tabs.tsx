import Link from "next/link";

const TABS = [
  { key: "overview", href: "/company", label: "Overview" },
  { key: "people", href: "/company/people", label: "People" },
  { key: "policy", href: "/company/policy", label: "Policy" },
  { key: "invoices", href: "/company/invoices", label: "Invoices" },
] as const;

export type CompanyTab = (typeof TABS)[number]["key"];

/** Sub-navigation for the client control panel. */
export function CompanyTabs({ active }: { active: CompanyTab }) {
  return (
    <nav className="flex w-fit rounded-xl border border-edge p-1">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
            tab.key === active
              ? "bg-raised font-medium text-body"
              : "text-muted hover:text-body"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
