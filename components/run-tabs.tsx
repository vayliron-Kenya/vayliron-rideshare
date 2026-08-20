"use client";

import { useState, type ReactNode } from "react";

/**
 * A run, cut into tabs so the driver never scrolls a wall.
 *
 * Working a bus means four separate jobs — being told whether to move,
 * checking people in, watching the line, and reporting trouble — and a driver
 * only ever does one of them at a time. Stacking all four down one page meant
 * scrolling past three to reach the one in hand, at a stop, with the engine
 * running. They are tabs now, and each fits the screen.
 *
 * The panels are rendered on the server and handed in as props, so the forms
 * inside them stay server actions and only the switching is client-side.
 */
export interface RunTab {
  id: string;
  label: string;
  /** A count worth seeing without opening the tab, e.g. riders still expected. */
  badge?: number;
  panel: ReactNode;
}

export function RunTabs({ tabs }: { tabs: RunTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <>
      <div
        role="tablist"
        aria-label="This run"
        className="glass flex shrink-0 gap-1 rounded-2xl p-1"
      >
        {tabs.map((tab) => {
          const selected = tab.id === current?.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(tab.id)}
              className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition-all ${
                selected
                  ? "brand-wash glow text-white"
                  : "text-muted hover:bg-[var(--glass-sheen)] hover:text-body"
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 ? (
                <span
                  className={`tabular rounded-full px-1.5 text-xs ${
                    selected ? "bg-white/25 text-white" : "bg-[var(--glass-edge)] text-body"
                  }`}
                >
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        className="tab-enter flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-1"
      >
        {current?.panel}
      </div>
    </>
  );
}
