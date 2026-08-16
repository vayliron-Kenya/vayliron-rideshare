"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { bookSeatAction, type FormState } from "@/app/actions";
import { AlertIcon, CheckIcon, PinIcon } from "@/components/icons";
import { BigButton, ChoiceRow, Notice } from "@/components/simple";
import { fareForKm, formatKes, splitFare } from "@/lib/domain/fares";

export interface StopOption {
  id: string;
  name: string;
  landmark: string;
  time: string;
  seq: number;
  kmFromStart: number;
}

export interface BookingFlowProps {
  tripId: string;
  stops: StopOption[];
  defaultBoardId: string;
  defaultAlightId: string;
  subsidyBps: number;
  monthlyCapKes: number;
  monthToDateKes: number;
  companyName: string;
}

type Editing = "board" | "alight" | null;

/**
 * Booking a city bus is one decision, not a form.
 *
 * The rider already has a home stage and a work stage on file, and they got
 * here by tapping a departure, so both ends of the journey are answered before
 * the screen renders. What they see is the journey and the price with a single
 * button under it; changing either end swaps the card for one list of stages.
 * There is no seat to choose — you get on and you sit down.
 */
export function BookingFlow(props: BookingFlowProps) {
  const [state, action] = useActionState<FormState, FormData>(bookSeatAction, {});
  const [boardId, setBoardId] = useState(props.defaultBoardId);
  const [alightId, setAlightId] = useState(props.defaultAlightId);
  const [editing, setEditing] = useState<Editing>(null);

  const board = props.stops.find((s) => s.id === boardId) ?? props.stops[0];
  const alight =
    props.stops.find((s) => s.id === alightId) ?? props.stops[props.stops.length - 1];

  const quote = useMemo(() => {
    const km = Math.round((alight.kmFromStart - board.kmFromStart) * 10) / 10;
    return splitFare({
      fareKes: fareForKm(km),
      subsidyBps: props.subsidyBps,
      monthlyCapKes: props.monthlyCapKes,
      monthToDateKes: props.monthToDateKes,
    });
  }, [board, alight, props.subsidyBps, props.monthlyCapKes, props.monthToDateKes]);

  const minutesOnBoard = minutesBetween(board.time, alight.time);

  /**
   * The stage rows are real submit buttons — large, keyboard reachable and
   * announced properly — so they are caught here before the form would post.
   * Only "Get on this bus" falls through to the server action.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (!submitter?.name) return;

    event.preventDefault();

    if (submitter.name === "pick-board") {
      setBoardId(submitter.value);
      const picked = props.stops.find((s) => s.id === submitter.value);
      // Getting on later than you get off is not a journey — push the far end out.
      if (picked && picked.seq >= alight.seq) {
        setAlightId(props.stops[props.stops.length - 1].id);
      }
      setEditing(null);
    } else if (submitter.name === "pick-alight") {
      setAlightId(submitter.value);
      setEditing(null);
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="tripId" value={props.tripId} />
      <input type="hidden" name="boardStopId" value={board.id} />
      <input type="hidden" name="alightStopId" value={alight.id} />

      {editing ? (
        <StagePicker
          question={editing === "board" ? "Where do you get on?" : "Where do you get off?"}
          field={editing === "board" ? "pick-board" : "pick-alight"}
          selectedId={editing === "board" ? board.id : alight.id}
          detailFor={editing === "board" ? "bus arrives" : "you arrive"}
          stops={
            editing === "board"
              ? props.stops.slice(0, -1)
              : props.stops.filter((s) => s.seq > board.seq)
          }
          onCancel={() => setEditing(null)}
        />
      ) : (
        <>
          <JourneyCard
            board={board}
            alight={alight}
            minutes={minutesOnBoard}
            onEditBoard={() => setEditing("board")}
            onEditAlight={() => setEditing("alight")}
          />

          <div className="rounded-3xl border-2 border-edge bg-surface p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-faint">You pay</p>
            <p className="tabular mt-1 text-6xl font-bold leading-none tracking-tight text-body">
              {quote.employeeKes === 0 ? "Free" : formatKes(quote.employeeKes)}
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted">
              {quote.employeeKes === 0 ? (
                <>
                  {props.companyName} covers the whole {formatKes(quote.fareKes)} fare.
                </>
              ) : (
                <>
                  {props.companyName} pays {formatKes(quote.employerKes)} of the{" "}
                  {formatKes(quote.fareKes)} fare. Your share comes off your payslip — no cash on
                  the bus.
                </>
              )}
            </p>
          </div>

          {quote.capApplied ? (
            <Notice
              tone="warn"
              icon={<AlertIcon className="size-5" />}
              title="You have used your monthly allowance"
            >
              {props.companyName} pays up to {formatKes(props.monthlyCapKes)} a month. The rest of
              this fare is yours.
            </Notice>
          ) : null}

          {state.error ? (
            <div data-form-result="error">
              <Notice
                tone="bad"
                icon={<AlertIcon className="size-5" />}
                title="We could not book that"
              >
                {state.error}
              </Notice>
            </div>
          ) : null}

          <ConfirmButton />
        </>
      )}
    </form>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <BigButton type="submit" disabled={pending} icon={<CheckIcon className="size-6" />}>
      {pending ? "Booking…" : "Get on this bus"}
    </BigButton>
  );
}

/** The journey, read left to right, with each end tappable to change. */
function JourneyCard({
  board,
  alight,
  minutes,
  onEditBoard,
  onEditAlight,
}: {
  board: StopOption;
  alight: StopOption;
  minutes: number | null;
  onEditBoard: () => void;
  onEditAlight: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border-2 border-edge bg-surface">
      <End
        label="Get on"
        stop={board}
        onEdit={onEditBoard}
        dotClass="bg-brand-bright"
      />
      <div className="flex items-center gap-3 border-y border-line bg-raised px-5 py-2">
        <span className="ml-[1.4rem] h-6 w-0.5 shrink-0 bg-edge" aria-hidden="true" />
        <p className="text-sm font-medium text-muted">
          {minutes === null ? "on the bus" : `${minutes} minutes on the bus`}
        </p>
      </div>
      <End label="Get off" stop={alight} onEdit={onEditAlight} dotClass="bg-flame-vivid" />
    </section>
  );
}

function End({
  label,
  stop,
  onEdit,
  dotClass,
}: {
  label: string;
  stop: StopOption;
  onEdit: () => void;
  dotClass: string;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <span className={`size-3 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-faint">{label}</p>
        <p className="truncate text-xl font-bold text-body">{stop.name}</p>
        <p className="tabular truncate text-sm text-muted">
          {stop.time} · {stop.landmark}
        </p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="min-h-11 shrink-0 rounded-xl border-2 border-edge px-4 text-base font-semibold text-body transition-colors hover:border-brand hover:text-accent"
      >
        Change
      </button>
    </div>
  );
}

function StagePicker({
  question,
  field,
  stops,
  selectedId,
  detailFor,
  onCancel,
}: {
  question: string;
  field: string;
  stops: StopOption[];
  selectedId: string;
  detailFor: string;
  onCancel: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-2xl font-bold tracking-tight text-body">{question}</h2>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl border-2 border-edge px-4 text-base font-semibold text-body transition-colors hover:border-brand hover:text-accent"
        >
          Cancel
        </button>
      </div>
      <ul className="space-y-3">
        {stops.map((stop) => (
          <li key={stop.id}>
            <ChoiceRow
              selected={selectedId === stop.id}
              icon={<PinIcon className="size-6" />}
              title={stop.name}
              detail={`${stop.landmark} · ${detailFor} ${stop.time}`}
              onClickName={{ name: field, value: stop.id }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Both times are "HH:MM" on the same running day, so plain subtraction holds. */
function minutesBetween(from: string, to: string): number | null {
  const parse = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const a = parse(from);
  const b = parse(to);
  if (a === null || b === null) return null;
  return b >= a ? b - a : b + 24 * 60 - a;
}
