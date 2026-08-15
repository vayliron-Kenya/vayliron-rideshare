"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import type { FormState } from "@/app/actions";

type Tone = "brand" | "flame" | "quiet";

const TONES: Record<Tone, string> = {
  brand: "bg-brand text-on-brand hover:bg-brand-hover",
  flame: "bg-flame text-on-brand hover:bg-flame/85",
  quiet: "border border-edge text-muted hover:text-body",
};

function Submit({
  label,
  tone,
  full,
  compact,
}: {
  label: string;
  tone: Tone;
  full: boolean;
  compact: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        compact
          ? "rounded-lg px-2.5 py-1 text-xs font-medium"
          : "rounded-xl px-4 py-2.5 text-sm font-semibold"
      } ${TONES[tone]} ${full ? "w-full" : ""}`}
    >
      {pending ? "…" : label}
    </button>
  );
}

/**
 * A form bound to a server action, with its result reported in place.
 *
 * Every write in the control panels needs the same three things — a pending
 * state, an error banner and a success banner — so they share one wrapper
 * rather than a dozen near-identical client components. The fields themselves
 * stay plain markup passed as children.
 */
export function ActionForm({
  action,
  children,
  submit = "Save",
  tone = "brand",
  className = "",
  fullWidthSubmit = false,
  resetOnSuccess = false,
  compact = false,
  footer,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  children: ReactNode;
  submit?: string;
  tone?: Tone;
  className?: string;
  fullWidthSubmit?: boolean;
  /** Clear the inputs after a successful write — right for "add another" forms. */
  resetOnSuccess?: boolean;
  /** Inline, table-cell sized: a single small button and no surrounding margin. */
  compact?: boolean;
  footer?: ReactNode;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.message) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}

      {state.error ? (
        <p
          data-form-result="error"
          role="alert"
          className="mt-3 rounded-lg bg-flame-soft px-3 py-2 text-xs leading-relaxed text-flame"
        >
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p
          data-form-result="ok"
          role="status"
          className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-xs leading-relaxed text-accent"
        >
          {state.message}
        </p>
      ) : null}

      <div className={compact ? "flex items-center gap-2" : "mt-4 flex items-center gap-3"}>
        <Submit label={submit} tone={tone} full={fullWidthSubmit} compact={compact} />
        {footer}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * Field primitives — plain markup, usable from server or client trees
 * ------------------------------------------------------------------ */

const CONTROL =
  "mt-1.5 w-full rounded-xl border border-edge bg-ink px-3 py-2.5 text-sm text-body placeholder:text-faint focus:border-brand focus:outline-none";

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
  hint,
  min,
  max,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-faint">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        step={step}
        className={CONTROL}
      />
      {hint ? <span className="mt-1 block text-[11px] text-faint">{hint}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  name,
  options,
  defaultValue,
  hint,
  includeBlank,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  hint?: string;
  includeBlank?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-faint">{label}</span>
      <select name={name} defaultValue={defaultValue} className={CONTROL}>
        {includeBlank ? <option value="">{includeBlank}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="mt-1 block text-[11px] text-faint">{hint}</span> : null}
    </label>
  );
}

export function TextAreaField({
  label,
  name,
  placeholder,
  rows = 3,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-faint">{label}</span>
      <textarea
        name={name}
        rows={rows}
        required={required}
        placeholder={placeholder}
        className={`${CONTROL} resize-y`}
      />
    </label>
  );
}

export function CheckField({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-muted">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 rounded border-edge bg-ink accent-[var(--color-brand)]"
      />
      {label}
    </label>
  );
}
