export type SeatKind = "window" | "aisle";

export interface Seat {
  seatNo: number;
  row: number;
  /** Column label as printed on the bus: A/B | aisle | C/D. */
  column: "A" | "B" | "C" | "D";
  kind: SeatKind;
}

export interface SeatRow {
  row: number;
  left: Seat[];
  right: Seat[];
}

const COLUMNS: Seat["column"][] = ["A", "B", "C", "D"];

/**
 * Seat map for a 2+2 coach. Seats are numbered front to back, left to right,
 * which is how the stickers are actually laid out in the fleet.
 */
export function seatMap(capacity: number): SeatRow[] {
  if (capacity <= 0) throw new RangeError("capacity must be positive");

  const rows: SeatRow[] = [];
  for (let seatNo = 1; seatNo <= capacity; seatNo += 1) {
    const index = seatNo - 1;
    const row = Math.floor(index / 4) + 1;
    const column = COLUMNS[index % 4];
    const seat: Seat = {
      seatNo,
      row,
      column,
      kind: column === "A" || column === "D" ? "window" : "aisle",
    };

    let target = rows[rows.length - 1];
    if (!target || target.row !== row) {
      target = { row, left: [], right: [] };
      rows.push(target);
    }
    if (column === "A" || column === "B") target.left.push(seat);
    else target.right.push(seat);
  }

  return rows;
}

export function allSeats(capacity: number): Seat[] {
  return seatMap(capacity).flatMap((row) => [...row.left, ...row.right]);
}

export class TripFullError extends Error {
  constructor() {
    super("This departure is fully booked");
    this.name = "TripFullError";
  }
}

/** Lowest-numbered seat still free, for riders who do not care where they sit. */
export function nextFreeSeat(capacity: number, taken: readonly number[]): number {
  const occupied = new Set(taken);
  for (let seatNo = 1; seatNo <= capacity; seatNo += 1) {
    if (!occupied.has(seatNo)) return seatNo;
  }
  throw new TripFullError();
}

export function isSeatAvailable(
  capacity: number,
  taken: readonly number[],
  seatNo: number,
): boolean {
  if (!Number.isInteger(seatNo) || seatNo < 1 || seatNo > capacity) return false;
  return !taken.includes(seatNo);
}

/** Six characters, no vowels and no 0/1/I/O — read aloud at the door without confusion. */
const PASS_ALPHABET = "23456789BCDFGHJKLMNPQRSTVWXYZ";

export function generatePassCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += PASS_ALPHABET[Math.floor(random() * PASS_ALPHABET.length)];
  }
  return code;
}
