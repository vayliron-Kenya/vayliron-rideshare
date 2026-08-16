"use client";

import { seatMap } from "@/lib/domain/seats";

export function SeatMap({
  capacity,
  taken,
  selected,
  onSelect,
}: {
  capacity: number;
  taken: number[];
  selected: number | null;
  onSelect: (seatNo: number | null) => void;
}) {
  const rows = seatMap(capacity);
  const takenSet = new Set(taken);

  return (
    <div>
      <p className="text-base font-semibold text-body">Seats on this bus</p>

      <div className="mt-3 rounded-2xl border border-edge bg-ink/60 p-4">
        <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Front · driver</span>
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Door</span>
        </div>

        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {rows.map((row) => (
            <div key={row.row} className="flex items-center gap-2">
              <span className="tabular w-5 shrink-0 text-right text-xs text-faint">
                {row.row}
              </span>
              <div className="flex gap-2">
                {row.left.map((seat) => (
                  <SeatButton
                    key={seat.seatNo}
                    seatNo={seat.seatNo}
                    kind={seat.kind}
                    taken={takenSet.has(seat.seatNo)}
                    selected={selected === seat.seatNo}
                    onSelect={onSelect}
                  />
                ))}
              </div>
              <span className="w-5" aria-hidden="true" />
              <div className="flex gap-2">
                {row.right.map((seat) => (
                  <SeatButton
                    key={seat.seatNo}
                    seatNo={seat.seatNo}
                    kind={seat.kind}
                    taken={takenSet.has(seat.seatNo)}
                    selected={selected === seat.seatNo}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3 text-sm text-muted">
          <Legend className="border-edge bg-surface" label="Free" />
          <Legend className="border-brand bg-brand" label="Yours" />
          <Legend className="border-transparent bg-edge" label="Taken" />
        </div>
      </div>
    </div>
  );
}

function SeatButton({
  seatNo,
  kind,
  taken,
  selected,
  onSelect,
}: {
  seatNo: number;
  kind: string;
  taken: boolean;
  selected: boolean;
  onSelect: (seatNo: number | null) => void;
}) {
  const base =
    "tabular size-11 shrink-0 rounded-lg border-2 text-sm font-semibold transition-colors";

  if (taken) {
    return (
      <span
        className={`${base} inline-flex cursor-not-allowed items-center justify-center border-transparent bg-edge text-faint line-through`}
        aria-label={`Seat ${seatNo}, already taken`}
      >
        {seatNo}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(selected ? null : seatNo)}
      aria-pressed={selected}
      aria-label={`Seat ${seatNo}, ${kind}`}
      className={`${base} ${
        selected
          ? "border-brand bg-brand text-on-brand"
          : "border-edge bg-surface text-body hover:border-brand hover:bg-brand-soft"
      }`}
    >
      {seatNo}
    </button>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-4 rounded border-2 ${className}`} />
      {label}
    </span>
  );
}
