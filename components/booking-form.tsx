"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { bookSeatAction, type FormState } from "@/app/actions";
import { SeatMap } from "@/components/seat-map";
import { bandForKm, fareForKm, formatKes, splitFare } from "@/lib/domain/fares";

export interface StopOption {
  id: string;
  name: string;
  landmark: string;
  time: string;
  seq: number;
  kmFromStart: number;
}

export interface BookingFormProps {
  tripId: string;
  capacity: number;
  takenSeats: number[];
  stops: StopOption[];
  defaultBoardId: string;
  defaultAlightId: string;
  subsidyBps: number;
  monthlyCapKes: number;
  monthToDateKes: number;
  companyName: string;
}

export function BookingForm(props: BookingFormProps) {
  const [state, action] = useActionState<FormState, FormData>(bookSeatAction, {});
  const [boardId, setBoardId] = useState(props.defaultBoardId);
  const [alightId, setAlightId] = useState(props.defaultAlightId);
  const [seatNo, setSeatNo] = useState<number | null>(null);

  const board = props.stops.find((s) => s.id === boardId);
  const alight = props.stops.find((s) => s.id === alightId);
  const validLeg = Boolean(board && alight && board.seq < alight.seq);

  const quote = useMemo(() => {
    if (!board || !alight || board.seq >= alight.seq) return null;
    const km = Math.round((alight.kmFromStart - board.kmFromStart) * 10) / 10;
    const fareKes = fareForKm(km);
    return {
      km,
      band: bandForKm(km),
      ...splitFare({
        fareKes,
        subsidyBps: props.subsidyBps,
        monthlyCapKes: props.monthlyCapKes,
        monthToDateKes: props.monthToDateKes,
      }),
    };
  }, [board, alight, props.subsidyBps, props.monthlyCapKes, props.monthToDateKes]);

  // Boarding must happen before alighting, so each select trims the other's list.
  const boardOptions = props.stops.filter((s) => !alight || s.seq < alight.seq);
  const alightOptions = props.stops.filter((s) => !board || s.seq > board.seq);

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <input type="hidden" name="tripId" value={props.tripId} />
      <input type="hidden" name="boardStopId" value={boardId} />
      <input type="hidden" name="alightStopId" value={alightId} />
      {seatNo !== null ? <input type="hidden" name="seatNo" value={seatNo} /> : null}

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <StopSelect
            id="board"
            label="Board at"
            value={boardId}
            options={boardOptions}
            onChange={(next) => {
              setBoardId(next);
              const picked = props.stops.find((s) => s.id === next);
              if (picked && alight && picked.seq >= alight.seq) {
                const after = props.stops.find((s) => s.seq > picked.seq);
                if (after) setAlightId(after.id);
              }
            }}
          />
          <StopSelect
            id="alight"
            label="Get off at"
            value={alightId}
            options={alightOptions}
            onChange={setAlightId}
          />
        </div>

        <SeatMap
          capacity={props.capacity}
          taken={props.takenSeats}
          selected={seatNo}
          onSelect={setSeatNo}
        />
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-body">Your fare</h2>

          {quote ? (
            <>
              <p className="mt-1 text-xs text-faint">
                {quote.km} km · {quote.band.label}
              </p>

              <dl className="mt-4 space-y-2.5 text-sm">
                <Line label="Fare" value={formatKes(quote.fareKes)} />
                <Line
                  label={`${props.companyName} pays`}
                  value={formatKes(quote.employerKes)}
                  tone="brand"
                />
                <div className="border-t border-line pt-2.5">
                  <Line label="You pay" value={formatKes(quote.employeeKes)} strong />
                </div>
              </dl>

              {quote.capApplied ? (
                <p className="mt-3 rounded-lg bg-amber-soft px-3 py-2 text-xs leading-relaxed text-amber">
                  You have reached your employer&apos;s monthly allowance of{" "}
                  {formatKes(props.monthlyCapKes)}, so the balance of this fare comes to you.
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-xs text-faint">
              Pick a boarding stage before your alighting stage to see the fare.
            </p>
          )}

          <div className="mt-4 rounded-lg bg-raised px-3 py-2 text-xs text-muted">
            {seatNo === null ? (
              <>You&apos;ll be given the lowest free seat at check-in.</>
            ) : (
              <>
                Seat <span className="tabular font-semibold text-body">{seatNo}</span> reserved for
                you.
              </>
            )}
          </div>

          {state.error ? (
            <p className="mt-3 rounded-lg bg-flame-soft px-3 py-2 text-xs text-flame" role="alert">
              {state.error}
            </p>
          ) : null}

          <div className="mt-4">
            <SubmitButton disabled={!validLeg} />
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            Your employer is invoiced monthly. Anything you owe is deducted through payroll — no
            cash and no M-Pesa prompt at the door.
          </p>
        </div>
      </aside>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Reserving…" : "Confirm seat"}
    </button>
  );
}

function StopSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: StopOption[];
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-medium uppercase tracking-wider text-faint"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-edge bg-ink px-3 py-2.5 text-sm text-body focus:border-brand focus:outline-none"
      >
        {options.map((stop) => (
          <option key={stop.id} value={stop.id}>
            {stop.time} — {stop.name} ({stop.landmark})
          </option>
        ))}
      </select>
    </div>
  );
}

function Line({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "brand";
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "text-body" : "text-muted"}>{label}</dt>
      <dd
        className={`tabular ${strong ? "text-base font-semibold text-body" : ""} ${
          tone === "brand" ? "text-accent" : "text-body"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
