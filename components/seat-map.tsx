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
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-faint">Choose a seat</p>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
            selected === null
              ? "bg-brand-soft text-accent ring-1 ring-inset ring-brand/40"
              : "text-muted hover:text-body"
          }`}
        >
          Any free seat
        </button>
      </div>

      <div className="mt-3 rounded-2xl border border-edge bg-ink/60 p-4">
        <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
          <span className="text-[10px] uppercase tracking-wider text-edge">Front · driver</span>
          <span className="text-[10px] uppercase tracking-wider text-edge">Door</span>
        </div>

        <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((row) => (
            <div key={row.row} className="flex items-center gap-2">
              <span className="tabular w-5 shrink-0 text-right text-[10px] text-edge">
                {row.row}
              </span>
              <div className="flex gap-1.5">
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
              <div className="flex gap-1.5">
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

        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3 text-[11px] text-faint">
          <Legend className="border-edge bg-raised" label="Free" />
          <Legend className="border-brand bg-brand" label="Yours" />
          <Legend className="border-edge/70 bg-ink" label="Taken" />
          <span className="ml-auto">Window seats are columns A and D</span>
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
    "tabular size-8 shrink-0 rounded-md border text-[11px] font-medium transition-colors";

  if (taken) {
    return (
      <span
        className={`${base} inline-flex cursor-not-allowed items-center justify-center border-edge/70 bg-ink text-faint/70`}
        aria-label={`Seat ${seatNo}, taken`}
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
          : "border-edge bg-raised text-muted hover:border-brand/60 hover:text-body"
      }`}
    >
      {seatNo}
    </button>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-3 rounded border ${className}`} />
      {label}
    </span>
  );
}
