"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { bookSeatAction, type FormState } from "@/app/actions";
import { AlertIcon, CheckIcon, PinIcon, SeatIcon, TicketIcon } from "@/components/icons";
import { SeatMap } from "@/components/seat-map";
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
  capacity: number;
  takenSeats: number[];
  stops: StopOption[];
  defaultBoardId: string;
  defaultAlightId: string;
  subsidyBps: number;
  monthlyCapKes: number;
  monthToDateKes: number;
  companyName: string;
  /**
   * The rider arrived from their own commute, so both ends are already known
   * and the first two questions are answered for them.
   */
  prefilled: boolean;
}

type Step = 1 | 2 | 3;

/**
 * Booking as three questions, asked one at a time.
 *
 * The dense version of this screen put two dropdowns and a seat grid in front
 * of the rider at once. Answered questions collapse to a single line with a
 * Change link, so there is never more than one thing to decide, and the fare
 * is only ever shown once both ends of the journey are known.
 */
export function BookingFlow(props: BookingFlowProps) {
  const [state, action] = useActionState<FormState, FormData>(bookSeatAction, {});
  const [step, setStep] = useState<Step>(props.prefilled ? 3 : 1);
  const [boardId, setBoardId] = useState<string | null>(
    props.prefilled ? props.defaultBoardId : null,
  );
  const [alightId, setAlightId] = useState<string | null>(
    props.prefilled ? props.defaultAlightId : null,
  );
  const [seatNo, setSeatNo] = useState<number | null>(null);

  const board = props.stops.find((s) => s.id === boardId) ?? null;
  const alight = props.stops.find((s) => s.id === alightId) ?? null;

  const quote = useMemo(() => {
    if (!board || !alight || board.seq >= alight.seq) return null;
    const km = Math.round((alight.kmFromStart - board.kmFromStart) * 10) / 10;
    return splitFare({
      fareKes: fareForKm(km),
      subsidyBps: props.subsidyBps,
      monthlyCapKes: props.monthlyCapKes,
      monthToDateKes: props.monthToDateKes,
    });
  }, [board, alight, props.subsidyBps, props.monthlyCapKes, props.monthToDateKes]);

  const ready = Boolean(board && alight && board.seq < alight.seq);

  /**
   * The choice rows are real submit buttons — large, keyboard reachable and
   * announced properly — so they are caught here before the form would post.
   * Only the final "Book my seat" button falls through to the server action.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (!submitter?.name) return;

    event.preventDefault();

    if (submitter.name === "pick-board") {
      const picked = props.stops.find((s) => s.id === submitter.value);
      setBoardId(submitter.value);
      if (picked && alight && picked.seq >= alight.seq) setAlightId(null);
      setStep(2);
    } else if (submitter.name === "pick-alight") {
      setAlightId(submitter.value);
      setStep(3);
    } else if (submitter.name === "pick-any-seat") {
      setSeatNo(null);
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="tripId" value={props.tripId} />
      <input type="hidden" name="boardStopId" value={boardId ?? ""} />
      <input type="hidden" name="alightStopId" value={alightId ?? ""} />
      {seatNo !== null ? <input type="hidden" name="seatNo" value={seatNo} /> : null}

      {/* ---- 1. Where do you get on? ---- */}
      <StepPanel
        number={1}
        question="Where do you get on?"
        open={step === 1}
        answer={board ? `${board.name} at ${board.time}` : null}
        onChange={() => setStep(1)}
      >
        <ul className="space-y-3">
          {props.stops.slice(0, -1).map((stop) => (
            <li key={stop.id}>
              <ChoiceRow
                selected={boardId === stop.id}
                icon={<PinIcon className="size-6" />}
                title={stop.name}
                detail={`${stop.landmark} · bus arrives ${stop.time}`}
                onClickName={{ name: "pick-board", value: stop.id }}
              />
            </li>
          ))}
        </ul>
      </StepPanel>

      {/* ---- 2. Where do you get off? ---- */}
      <StepPanel
        number={2}
        question="Where do you get off?"
        open={step === 2}
        answer={alight ? `${alight.name} at ${alight.time}` : null}
        onChange={() => setStep(2)}
        locked={!board}
      >
        <ul className="space-y-3">
          {props.stops
            .filter((s) => board && s.seq > board.seq)
            .map((stop) => (
              <li key={stop.id}>
                <ChoiceRow
                  selected={alightId === stop.id}
                  icon={<PinIcon className="size-6" />}
                  title={stop.name}
                  detail={`${stop.landmark} · you arrive ${stop.time}`}
                  onClickName={{ name: "pick-alight", value: stop.id }}
                />
              </li>
            ))}
        </ul>
      </StepPanel>

      {/* ---- 3. Which seat? ---- */}
      <StepPanel
        number={3}
        question="Which seat do you want?"
        open={step === 3}
        answer={seatNo === null ? (ready ? "Any free seat" : null) : `Seat ${seatNo}`}
        onChange={() => setStep(3)}
        locked={!ready}
      >
        <div className="space-y-4">
          <ChoiceRow
            selected={seatNo === null}
            icon={<SeatIcon className="size-6" />}
            title="Any free seat"
            detail="We pick one for you — this is the easy choice"
            onClickName={{ name: "pick-any-seat", value: "1" }}
          />
          <div>
            <p className="mb-3 text-base font-semibold text-body">Or choose one yourself</p>
            <SeatMap
              capacity={props.capacity}
              taken={props.takenSeats}
              selected={seatNo}
              onSelect={setSeatNo}
            />
          </div>
        </div>
      </StepPanel>

      {/* ---- Fare and confirm ---- */}
      {ready && quote ? (
        <div className="space-y-4 rounded-3xl border-2 border-brand/40 bg-brand-soft p-5">
          <div className="flex items-center gap-3">
            <TicketIcon className="size-6 text-accent" />
            <h2 className="text-lg font-bold text-accent">What this costs you</h2>
          </div>

          <p className="tabular text-5xl font-bold leading-none text-body">
            {formatKes(quote.employeeKes)}
          </p>
          <p className="text-base text-muted">
            {quote.employeeKes === 0 ? (
              <>
                Nothing to pay. {props.companyName} covers the whole{" "}
                {formatKes(quote.fareKes)} fare.
              </>
            ) : (
              <>
                {props.companyName} pays {formatKes(quote.employerKes)} of the{" "}
                {formatKes(quote.fareKes)} fare. Your share comes off your payslip — no cash
                on the bus.
              </>
            )}
          </p>

          {quote.capApplied ? (
            <Notice
              tone="warn"
              icon={<AlertIcon className="size-5" />}
              title="You have used your monthly allowance"
            >
              {props.companyName} pays up to {formatKes(props.monthlyCapKes)} a month. The rest
              of this fare is yours.
            </Notice>
          ) : null}

          {state.error ? (
            <Notice tone="bad" icon={<AlertIcon className="size-5" />} title="We could not book that">
              {state.error}
            </Notice>
          ) : null}

          <ConfirmButton />
        </div>
      ) : null}

    </form>
  );
}

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <BigButton type="submit" disabled={pending} icon={<CheckIcon className="size-6" />}>
      {pending ? "Saving your seat…" : "Book my seat"}
    </BigButton>
  );
}

function StepPanel({
  number,
  question,
  open,
  answer,
  onChange,
  locked = false,
  children,
}: {
  number: number;
  question: string;
  open: boolean;
  answer: string | null;
  onChange: () => void;
  locked?: boolean;
  children: React.ReactNode;
}) {
  const done = answer !== null && !open;

  return (
    <section
      className={`rounded-3xl border-2 ${
        open ? "border-brand bg-surface" : "border-edge bg-surface"
      } ${locked && !open ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-base font-bold ${
            done ? "bg-brand text-on-brand" : open ? "bg-brand text-on-brand" : "bg-raised text-muted"
          }`}
        >
          {done ? <CheckIcon className="size-5" /> : number}
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-body">{question}</h2>
          {done ? <p className="truncate text-base text-muted">{answer}</p> : null}
        </div>

        {done && !locked ? (
          <button
            type="button"
            onClick={onChange}
            className="min-h-11 shrink-0 rounded-xl border-2 border-edge px-4 text-base font-semibold text-body transition-colors hover:border-brand hover:text-accent"
          >
            Change
          </button>
        ) : null}
      </div>

      {open && !locked ? <div className="px-5 pb-5">{children}</div> : null}
    </section>
  );
}
