"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { uploadPhotoAction } from "@/app/fleet-actions";
import type { FormState } from "@/app/actions";
import { CheckIcon } from "@/components/icons";
import type { PhotoAngle } from "@/lib/types";

/**
 * One photograph, one slot.
 *
 * An owner is standing next to their bus with a phone, so the control is the
 * whole tile: tapping anywhere on it opens the camera. Choosing a file submits
 * immediately — asking someone to pick a photo and then find a separate Upload
 * button is one step too many when there are four of these on the page.
 */
export function PhotoUpload({
  vehicleId,
  angle,
  label,
  hint,
  existingId,
  locked,
}: {
  vehicleId: string;
  angle: PhotoAngle;
  label: string;
  hint: string;
  existingId: string | null;
  locked: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(uploadPhotoAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  // Bumped on every successful upload so the browser refetches a replaced image.
  const [version, setVersion] = useState(0);

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-2xl border border-line bg-surface/80 p-4"
    >
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="angle" value={angle} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-body">{label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-faint">{hint}</p>
        </div>
        {existingId ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-accent">
            <CheckIcon className="size-3.5" />
            Added
          </span>
        ) : null}
      </div>

      <div className="mt-3">
        {existingId ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from a
          // private route with an auth check, not a static asset Next can optimise.
          <img
            src={`/api/vehicle-photos/${existingId}?v=${version}`}
            alt={label}
            className="h-40 w-full rounded-xl border border-line object-cover"
          />
        ) : (
          <div className="flex h-40 w-full items-center justify-center rounded-xl border border-dashed border-edge text-xs text-faint">
            No photograph yet
          </div>
        )}
      </div>

      {locked ? (
        <p className="mt-3 text-xs text-faint">
          This bus is approved. Contact Vayliron to change its photographs.
        </p>
      ) : (
        <Picker
          onPick={() => {
            setVersion((v) => v + 1);
            formRef.current?.requestSubmit();
          }}
          replacing={Boolean(existingId)}
        />
      )}

      {state.error ? (
        <p role="alert" className="mt-2 rounded-lg bg-flame-soft px-3 py-2 text-xs text-flame">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function Picker({ onPick, replacing }: { onPick: () => void; replacing: boolean }) {
  const { pending } = useFormStatus();

  return (
    <label
      className={`mt-3 flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-edge px-4 text-sm font-semibold transition-colors ${
        pending ? "text-faint" : "text-accent hover:border-brand"
      }`}
    >
      <input
        type="file"
        name="photo"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        disabled={pending}
        onChange={onPick}
      />
      {pending ? "Uploading…" : replacing ? "Replace photograph" : "Take or choose a photograph"}
    </label>
  );
}
