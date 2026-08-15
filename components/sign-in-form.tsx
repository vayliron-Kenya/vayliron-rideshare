"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signInAction, type FormState } from "@/app/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-brand-bright disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Checking…" : "Continue"}
    </button>
  );
}

export function SignInForm({ suggestions }: { suggestions: string[] }) {
  const [state, action] = useActionState<FormState, FormData>(signInAction, {});

  return (
    <form action={action} className="space-y-3">
      <label htmlFor="email" className="block text-xs font-medium uppercase tracking-wider text-faint">
        Work email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@yourcompany.co.ke"
        list="vayliron-demo-accounts"
        className="w-full rounded-xl border border-edge bg-ink px-4 py-2.5 text-sm text-body placeholder:text-faint focus:border-brand focus:outline-none"
      />
      <datalist id="vayliron-demo-accounts">
        {suggestions.map((email) => (
          <option key={email} value={email} />
        ))}
      </datalist>

      {state.error ? (
        <p className="rounded-lg bg-flame-soft px-3 py-2 text-xs text-flame" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
