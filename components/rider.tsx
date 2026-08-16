import Link from "next/link";
import type { ReactNode } from "react";

import { HomeIcon, WorkIcon } from "@/components/icons";
import type { Direction } from "@/lib/types";

/**
 * The rider surface's visual vocabulary.
 *
 * Every tab is built from the same four pieces so the four screens read as one
 * app: a title block, one loud card carrying the screen's answer, small
 * uppercase eyebrows labelling anything that isn't self-evident, and quiet
 * bordered cards for everything after the answer.
 *
 * The loud card is the brand gradient — bright purple falling into Vayliron's
 * deep indigo — and there is never more than one of them on a screen. That is
 * the whole trick: the eye lands on the gradient, and the gradient is always
 * the thing you opened the app for.
 */

/** The title block at the top of a tab. Small date, large name. */
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
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-faint">{eyebrow}</p>
        <h1 className="mt-1 truncate text-3xl font-bold tracking-tight text-body">{title}</h1>
      </div>
      {action}
    </header>
  );
}

/** A small uppercase label. Used on the gradient card and off it. */
export function Eyebrow({ children, onWash }: { children: ReactNode; onWash?: boolean }) {
  return (
    <p
      className={`text-xs font-bold uppercase tracking-[0.16em] ${
        onWash ? "text-white/70" : "text-faint"
      }`}
    >
      {children}
    </p>
  );
}

/** The one loud card on a screen. */
export function HeroCard({ children }: { children: ReactNode }) {
  return (
    <section className="brand-wash tab-enter overflow-hidden rounded-[1.75rem] shadow-lg shadow-brand/20">
      {children}
    </section>
  );
}

/** A quiet card, for anything that comes after the answer. */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl border-2 border-edge bg-surface ${className}`}>
      {children}
    </section>
  );
}

/**
 * The boarding pass code, set the way it is actually used: held up at the door
 * of a bus for someone to read off at a glance, in daylight, from a metre away.
 */
export function PassCode({ code, onWash = false }: { code: string; onWash?: boolean }) {
  return (
    <div
      className={`rounded-2xl px-4 py-3 text-center ${
        onWash ? "bg-white/15 backdrop-blur-sm" : "border-2 border-edge bg-raised"
      }`}
    >
      <p
        className={`text-xs font-bold uppercase tracking-[0.16em] ${
          onWash ? "text-white/70" : "text-faint"
        }`}
      >
        Show this at the door
      </p>
      <p
        className={`mt-1 font-mono text-4xl font-bold tracking-[0.22em] ${
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
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
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

/** One number and one plain label, three across on a phone. */
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
    <div className="rounded-2xl border-2 border-edge bg-surface px-3 py-4 text-center">
      <p
        className={`tabular text-lg font-bold leading-tight tracking-tight ${
          accent ? "brand-ink" : "text-body"
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs leading-tight text-muted">{label}</p>
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
    <section className="tab-enter rounded-[1.75rem] border-2 border-dashed border-edge px-6 py-10 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-accent">
        {icon}
      </span>
      <h2 className="mt-4 text-xl font-bold text-body">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-xs text-base leading-relaxed text-muted">{children}</p>
      {cta ? (
        <Link
          href={cta.href}
          className="brand-wash mt-5 inline-flex min-h-12 items-center rounded-2xl px-6 text-base font-semibold text-white"
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
 * Riders were shown "37 of 49 seats", which is a number you have to do sums on
 * while a bus is pulling in. The word is the decision; the bar is the texture
 * behind it.
 */
export function CrowdBar({ label, pct }: { label: string; pct: number }) {
  const tone = pct >= 100 ? "bg-flame-vivid" : pct >= 85 ? "bg-amber-vivid" : "bg-brand-bright";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-edge" aria-hidden="true">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-sm text-muted">{label}</span>
    </span>
  );
}
