"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { boardPassAction, type FormState } from "@/app/actions";

function ScanButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brand-bright disabled:opacity-60"
    >
      {pending ? "Checking…" : "Board"}
    </button>
  );
}

export function BoardingForm({ tripId }: { tripId: string }) {
  const [state, action] = useActionState<FormState, FormData>(boardPassAction, {});
  const inputRef = useRef<HTMLInputElement>(null);

  // The conductor works through a queue at the door — put the cursor straight
  // back in the box after every scan so they never have to reach for it.
  useEffect(() => {
    if (state.message || state.error) {
      const input = inputRef.current;
      if (input) {
        input.value = "";
        input.focus();
      }
    }
  }, [state]);

  return (
    <div>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="tripId" value={tripId} />
        <div className="flex-1">
          <label
            htmlFor="passCode"
            className="block text-xs font-medium uppercase tracking-wider text-faint"
          >
            Boarding pass code
          </label>
          <input
            ref={inputRef}
            id="passCode"
            name="passCode"
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={8}
            placeholder="e.g. K7M2QP"
            className="mt-2 w-full rounded-xl border border-edge bg-ink px-4 py-2.5 font-mono text-lg uppercase tracking-[0.3em] text-body placeholder:tracking-normal placeholder:text-faint focus:border-brand focus:outline-none"
          />
        </div>
        <ScanButton />
      </form>

      {state.message ? (
        <p
          data-board-result="ok"
          role="status"
          className="mt-3 rounded-lg bg-brand-soft px-4 py-2.5 text-sm text-brand-bright"
        >
          {state.message}
        </p>
      ) : null}
      {state.error ? (
        <p
          data-board-result="error"
          role="alert"
          className="mt-3 rounded-lg bg-flame-soft px-4 py-2.5 text-sm text-flame"
        >
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
