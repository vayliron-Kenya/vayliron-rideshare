/**
 * A small inline icon set.
 *
 * Icons carry meaning here, not decoration: a rider who reads slowly, or not
 * at all, should still be able to tell "your bus" from "your ticket" from
 * "where it is". They are always paired with a word, never used alone.
 *
 * Stroke-based on `currentColor` so they take the colour of the text beside
 * them and follow the theme without any extra wiring.
 */
type IconProps = { className?: string };

function Svg({ className = "size-6", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function BusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="12" rx="3" />
      <path d="M3 10h18" />
      <path d="M7 20v-2M17 20v-2" />
      <circle cx="7.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

export function TicketIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a2.5 2.5 0 0 0 0 5v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1a2.5 2.5 0 0 0 0-5V8Z" />
      <path d="M12 8v1M12 12v1M12 16v-1" />
    </Svg>
  );
}

export function SeatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4h6a2 2 0 0 1 2 2v7H9a2 2 0 0 1-2-2V4Z" />
      <path d="M5 13h12a2 2 0 0 1 2 2v5" />
      <path d="M5 13v7" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 13 4.5 4.5L19 7" />
    </Svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4 11 8-6.5 8 6.5" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </Svg>
  );
}

export function WorkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </Svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4 3 20h18L12 4Z" />
      <path d="M12 10v4M12 17.5v.5" />
    </Svg>
  );
}

export function ArrowIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h13" />
      <path d="m12 6 6 6-6 6" />
    </Svg>
  );
}
