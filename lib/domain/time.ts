/**
 * Everything the service does happens on Nairobi time.
 *
 * Kenya observes EAT (UTC+03:00) all year and has no daylight saving, so a
 * fixed offset is correct here — not the usual timezone shortcut that breaks
 * twice a year.
 */
export const NAIROBI_OFFSET = "+03:00";
export const NAIROBI_TZ = "Africa/Nairobi";

/** Absolute instant of a local Nairobi date + time. */
export function nairobiInstant(serviceDate: string, hhmm: string): Date {
  const parsed = new Date(`${serviceDate}T${hhmm}:00${NAIROBI_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError(`invalid Nairobi date/time: ${serviceDate} ${hhmm}`);
  }
  return parsed;
}

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: NAIROBI_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: NAIROBI_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** YYYY-MM-DD in Nairobi. */
export function nairobiDate(at: Date = new Date()): string {
  return dateParts.format(at);
}

/** HH:MM in Nairobi. */
export function nairobiTime(at: Date = new Date()): string {
  return timeParts.format(at);
}

/** Adds whole days to a YYYY-MM-DD string. */
export function addDays(serviceDate: string, days: number): string {
  const base = new Date(`${serviceDate}T12:00:00${NAIROBI_OFFSET}`);
  base.setUTCDate(base.getUTCDate() + days);
  return dateParts.format(base);
}

/** 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD service date. */
export function dayOfWeek(serviceDate: string): number {
  return new Date(`${serviceDate}T12:00:00${NAIROBI_OFFSET}`).getUTCDay();
}

export function isWeekday(serviceDate: string): boolean {
  const day = dayOfWeek(serviceDate);
  return day >= 1 && day <= 5;
}

const LONG_DATE = new Intl.DateTimeFormat("en-KE", {
  timeZone: NAIROBI_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function formatServiceDate(serviceDate: string): string {
  return LONG_DATE.format(new Date(`${serviceDate}T12:00:00${NAIROBI_OFFSET}`));
}

/** "in 12 min", "8 min ago", "now". */
export function relativeMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded === 0) return "now";
  if (rounded > 0) {
    if (rounded < 60) return `in ${rounded} min`;
    const h = Math.floor(rounded / 60);
    const m = rounded % 60;
    return m ? `in ${h} h ${m} min` : `in ${h} h`;
  }
  const ago = Math.abs(rounded);
  if (ago < 60) return `${ago} min ago`;
  return `${Math.floor(ago / 60)} h ago`;
}
