"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { payFareAction, type FormState } from "@/app/actions";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { formatKes } from "@/lib/domain/fares";

/**
 * Paying a fare.
 *
 * One amount, one phone number, one button. The number is pre-filled from the
 * rider's own record because in practice it is always the same phone — but it
 * stays editable, since plenty of people in Nairobi pay from a second line.
 */
export function PayForm({
  paymentId,
  amountKes,
  defaultPhone,
}: {
  paymentId: string;
  amountKes: number;
  defaultPhone: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(payFareAction, {});

  if (state.message) {
    return (
      <div
        data-form-result="ok"
        className="flex items-start gap-3 rounded-2xl border-2 border-brand/40 bg-brand-soft px-4 py-3.5"
      >
        <CheckIcon className="mt-0.5 size-5 shrink-0 text-accent" />
        <p className="text-base leading-relaxed text-accent">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="paymentId" value={paymentId} />

      <label className="block">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-faint">
          M-Pesa number
        </span>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={defaultPhone}
          required
          className="tabular mt-1.5 min-h-14 w-full rounded-2xl border-2 border-edge bg-surface px-4 text-xl font-semibold text-body focus:border-brand focus:outline-none"
        />
      </label>

      {state.error ? (
        <p
          data-form-result="error"
          role="alert"
          className="flex items-start gap-2 rounded-2xl bg-flame-soft px-4 py-3 text-base leading-relaxed text-flame"
        >
          <AlertIcon className="mt-0.5 size-5 shrink-0" />
          {state.error}
        </p>
      ) : null}

      <PayButton amountKes={amountKes} />

      <p className="text-center text-xs leading-relaxed text-faint">
        You will get an M-Pesa prompt on that phone. Enter your PIN to finish.
      </p>
    </form>
  );
}

function PayButton({ amountKes }: { amountKes: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="brand-wash flex min-h-14 w-full items-center justify-center rounded-2xl text-lg font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-70"
    >
      {pending ? "Sending the prompt…" : `Pay ${formatKes(amountKes)}`}
    </button>
  );
}
