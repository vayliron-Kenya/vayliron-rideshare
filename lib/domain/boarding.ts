/**
 * Capacity and boarding passes.
 *
 * Vayliron runs city buses, not coaches: nobody reserves seat 14B, they get on
 * and sit down. What still has to be true is that a bus never sells more places
 * than it holds, so every booking takes an internal *place number* — the lowest
 * one free — and the database keeps a unique index on it. That index is what
 * makes two riders racing for the last place impossible; it is a capacity
 * counter that happens to be atomic, and it is never shown to anyone.
 */

export class BusFullError extends Error {
  constructor() {
    super("This bus is full");
    this.name = "BusFullError";
  }
}

/** The lowest unused place on a bus. Throws once every place is taken. */
export function nextFreePlace(capacity: number, taken: readonly number[]): number {
  if (capacity <= 0) throw new RangeError("capacity must be positive");

  const occupied = new Set(taken);
  for (let place = 1; place <= capacity; place += 1) {
    if (!occupied.has(place)) return place;
  }
  throw new BusFullError();
}

/** How full a bus is, 0–100, for the crowding indicator riders see. */
export function loadPct(capacity: number, sold: number): number {
  if (capacity <= 0) return 0;
  return Math.min(100, Math.round((sold / capacity) * 100));
}

export type Crowding = "quiet" | "filling" | "busy" | "full";

/**
 * Crowding as a word, because "37 of 49" means nothing to someone deciding
 * whether to wait for the next one.
 */
export function crowding(capacity: number, sold: number): Crowding {
  const free = capacity - sold;
  if (free <= 0) return "full";
  const pct = loadPct(capacity, sold);
  if (pct >= 85) return "busy";
  if (pct >= 55) return "filling";
  return "quiet";
}

export const CROWDING_LABEL: Record<Crowding, string> = {
  quiet: "Lots of room",
  filling: "Filling up",
  busy: "Nearly full",
  full: "Full",
};

/** Six characters, no vowels and no 0/1/I/O — read aloud at the door without confusion. */
const PASS_ALPHABET = "23456789BCDFGHJKLMNPQRSTVWXYZ";

export function generatePassCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += PASS_ALPHABET[Math.floor(random() * PASS_ALPHABET.length)];
  }
  return code;
}
