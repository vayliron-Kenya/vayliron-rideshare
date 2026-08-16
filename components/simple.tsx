import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The plain-language rider layer.
 *
 * The control panels are tools for people paid to use them, and they stay
 * dense. What a commuter touches is different: they are standing at a stage in
 * the dark, possibly handing the phone to a child to read the time, possibly
 * not reading English quickly. So this layer is built to three rules —
 *
 *   1. one obvious thing to do per screen, as a full-width button;
 *   2. targets of at least 56px, which is a thumb, not a cursor;
 *   3. every label is something you would say out loud: "Where do you get on?"
 *      rather than "Boarding stage".
 *
 * Nothing here relies on colour alone: each state carries an icon or a word.
 */

/** The single primary action on a screen. */
export function BigButton({
  href,
  children,
  icon,
  tone = "brand",
  type,
  disabled,
}: {
  href?: string;
  children: ReactNode;
  icon?: ReactNode;
  tone?: "brand" | "quiet";
  type?: "submit";
  disabled?: boolean;
}) {
  const base =
    "flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl px-6 text-lg font-semibold transition-colors";
  const skin =
    tone === "brand"
      ? "bg-brand text-on-brand hover:bg-brand-hover"
      : "border-2 border-edge text-body hover:border-brand hover:text-accent";

  if (href) {
    return (
      <Link href={href} className={`${base} ${skin}`}>
        {icon}
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type ?? "button"}
      disabled={disabled}
      className={`${base} ${skin} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {icon}
      {children}
    </button>
  );
}

/** A tappable row in a list of choices — a stage, a departure, an option. */
export function ChoiceRow({
  href,
  onClickName,
  selected = false,
  icon,
  title,
  detail,
  trailing,
}: {
  href?: string;
  /** Renders as a submit button with this name when there is no href. */
  onClickName?: { name: string; value: string };
  selected?: boolean;
  icon?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
}) {
  const inner = (
    <>
      {icon ? (
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
            selected ? "bg-brand text-on-brand" : "bg-brand-soft text-accent"
          }`}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-lg font-semibold text-body">{title}</span>
        {detail ? <span className="mt-0.5 block text-sm text-muted">{detail}</span> : null}
      </span>
      {trailing}
    </>
  );

  const skin = `flex min-h-16 w-full items-center gap-4 rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
    selected
      ? "border-brand bg-brand-soft"
      : "border-edge bg-surface hover:border-brand/60"
  }`;

  if (href) {
    return (
      <Link href={href} className={skin}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="submit" name={onClickName?.name} value={onClickName?.value} className={skin}>
      {inner}
    </button>
  );
}

/** "Step 2 of 3 — Where do you get off?" */
export function StepHeader({
  step,
  total,
  question,
  hint,
}: {
  step: number;
  total: number;
  question: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-2 flex-1 rounded-full ${i < step ? "bg-brand" : "bg-edge"}`}
          />
        ))}
      </div>
      <p className="mt-3 text-sm font-medium text-muted">
        Step {step} of {total}
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-body">{question}</h1>
      {hint ? <p className="mt-2 text-base text-muted">{hint}</p> : null}
    </div>
  );
}

/** A big fact: one number and one plain label under it. */
export function BigFact({
  value,
  label,
  tone = "body",
}: {
  value: ReactNode;
  label: string;
  tone?: "body" | "brand";
}) {
  return (
    <div className="rounded-2xl border-2 border-edge bg-surface p-4 text-center">
      <p
        className={`tabular text-3xl font-bold ${
          tone === "brand" ? "text-accent" : "text-body"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}

/** A short, loud message — good news, a warning, or a problem. */
export function Notice({
  tone,
  icon,
  title,
  children,
}: {
  tone: "good" | "warn" | "bad";
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  const skin =
    tone === "good"
      ? "border-brand/40 bg-brand-soft text-accent"
      : tone === "warn"
        ? "border-amber/40 bg-amber-soft text-amber"
        : "border-flame/40 bg-flame-soft text-flame";

  return (
    <div className={`flex items-start gap-3 rounded-2xl border-2 px-4 py-3.5 ${skin}`}>
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div>
        <p className="text-base font-semibold">{title}</p>
        {children ? <div className="mt-0.5 text-sm leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}
