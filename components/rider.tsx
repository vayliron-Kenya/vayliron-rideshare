import Link from "next/link";
import type { ReactNode } from "react";

import { HomeIcon, WorkIcon } from "@/components/icons";
import type { Direction } from "@/lib/types";

/**
 * The rider surface's visual vocabulary.
 *
 * Everything here is glass: translucent panes floating over the aurora, each
 * with a hairline of light along its top edge. Nothing is a flat card on a
 * flat page, because the whole point is that the screen feels like it has
 * depth and the colour behind it is alive.
 *
 * The other rule is size. Each tab is exactly one screen — no scrolling the
 * page up or down — so these pieces are built to be laid out in a fixed
 * column: a small head, one loud panel, and whatever fits under it.
 */

/** The tab, laid out to fill the panel exactly. */
export function Screen({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className="flex shrink-0 items-end justify-between gap-3 pb-3 pt-1">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-faint">
            {eyebrow}
          </p>
          <h1 className="mt-0.5 truncate text-[1.7rem] font-bold leading-tight tracking-tight text-body">
            {title}
          </h1>
        </div>
        {action}
      </header>

      <div className="tab-enter flex min-h-0 flex-1 flex-col gap-3 pb-1">{children}</div>
    </>
  );
}

/** A small uppercase label. Used on the loud panel and off it. */
export function Eyebrow({ children, onWash }: { children: ReactNode; onWash?: boolean }) {
  return (
    <p
      className={`text-[0.68rem] font-bold uppercase tracking-[0.2em] ${
        onWash ? "text-white/65" : "text-faint"
      }`}
    >
      {children}
    </p>
  );
}

/**
 * The one loud panel on a screen.
 *
 * Brand gradient behind glass, with a ring of light around it — the thing the
 * eye lands on, always carrying whatever you opened the tab for.
 */
export function HeroCard({
  children,
  grow = false,
}: {
  children: ReactNode;
  grow?: boolean;
}) {
  return (
    <section
      className={`brand-wash glow relative overflow-hidden rounded-[1.65rem] ${
        grow ? "flex min-h-0 flex-1 flex-col" : "shrink-0"
      }`}
    >
      {/* A sheen across the top edge, so the panel reads as a pane of glass
          catching light rather than a coloured rectangle. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40"
      />
      {children}
    </section>
  );
}

/** A quiet pane, for anything that comes after the answer. */
export function Card({
  children,
  className = "",
  grow = false,
}: {
  children: ReactNode;
  className?: string;
  grow?: boolean;
}) {
  return (
    <section
      className={`glass rounded-[1.4rem] ${
        grow ? "flex min-h-0 flex-1 flex-col" : "shrink-0"
      } ${className}`}
    >
      {children}
    </section>
  );
}

/**
 * The code the conductor reads off your phone.
 *
 * Set the way it is actually used: held up at the door of a bus, in daylight,
 * for someone a metre away to read aloud.
 */
export function PassCode({ code, onWash = false }: { code: string; onWash?: boolean }) {
  return (
    <div
      className={`rounded-2xl px-4 py-2.5 text-center ${
        onWash ? "bg-white/15 backdrop-blur-sm" : "glass"
      }`}
    >
      <p
        className={`text-[0.66rem] font-bold uppercase tracking-[0.2em] ${
          onWash ? "text-white/65" : "text-faint"
        }`}
      >
        Show the conductor this code
      </p>
      <p
        className={`mt-0.5 font-mono text-[2rem] font-bold leading-tight tracking-[0.2em] ${
          onWash ? "text-white" : "text-body"
        }`}
      >
        {code}
      </p>
    </div>
  );
}

/** "To work" or "To home" — the only two journeys anyone makes here. */
export function DirectionChip({
  direction,
  onWash = false,
}: {
  direction: Direction;
  onWash?: boolean;
}) {
  const toWork = direction === "inbound";
  const Icon = toWork ? WorkIcon : HomeIcon;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
        onWash
          ? "bg-white/15 text-white"
          : toWork
            ? "bg-brand-soft text-accent"
            : "bg-flame-soft text-flame"
      }`}
    >
      <Icon className="size-4" />
      {toWork ? "To work" : "To home"}
    </span>
  );
}

/** One number and one plain label, three across. */
export function StatTile({
  value,
  label,
  accent = false,
}: {
  value: ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="glass rounded-2xl px-3 py-3 text-center">
      <p
        className={`tabular text-lg font-bold leading-tight tracking-tight ${
          accent ? "brand-ink" : "text-body"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs leading-tight text-muted">{label}</p>
    </div>
  );
}

/** Nothing to show yet, said without making it feel like a failure. */
export function EmptyTab({
  icon,
  title,
  children,
  cta,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  cta?: { href: string; label: string };
}) {
  return (
    <section className="glass flex min-h-0 flex-1 flex-col items-center justify-center rounded-[1.65rem] px-6 text-center">
      <span className="brand-wash glow flex size-16 items-center justify-center rounded-2xl text-white">
        {icon}
      </span>
      <h2 className="mt-4 text-xl font-bold text-body">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-xs text-base leading-relaxed text-muted">{children}</p>
      {cta ? (
        <Link
          href={cta.href}
          className="brand-wash glow mt-5 inline-flex min-h-12 items-center rounded-2xl px-6 text-base font-bold text-white"
        >
          {cta.label}
        </Link>
      ) : null}
    </section>
  );
}

/**
 * How full the bus is, as a word and a bar.
 *
 * "37 of 49 seats" is a sum you have to do while a bus is pulling in. The word
 * is the decision; the bar is the texture behind it.
 */
export function CrowdBar({ label, pct }: { label: string; pct: number }) {
  const tone = pct >= 100 ? "bg-flame-vivid" : pct >= 85 ? "bg-amber-vivid" : "bg-brand-bright";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-[var(--glass-edge)]" aria-hidden="true">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-sm text-muted">{label}</span>
    </span>
  );
}

/** Kept for the pages that still lay out their own head. */
export function TabHead({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-faint">{eyebrow}</p>
        <h1 className="mt-0.5 truncate text-[1.7rem] font-bold leading-tight tracking-tight text-body">
          {title}
        </h1>
      </div>
      {action}
    </header>
  );
}
