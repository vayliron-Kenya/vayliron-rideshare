import type { ReactNode } from "react";

type Tone = "neutral" | "brand" | "amber" | "flame" | "sky";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-raised text-muted ring-edge",
  brand: "bg-brand-soft text-brand-bright ring-brand/40",
  amber: "bg-amber-soft text-amber ring-amber/40",
  flame: "bg-flame-soft text-flame ring-flame/40",
  sky: "bg-sky-soft text-sky ring-sky/40",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface/80 backdrop-blur-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-wide text-body">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-faint">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  const accent =
    tone === "brand"
      ? "text-brand-bright"
      : tone === "amber"
        ? "text-amber"
        : tone === "flame"
          ? "text-flame"
          : "text-body";

  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-faint">{label}</p>
      <p className={`tabular mt-2 text-2xl font-semibold ${accent}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-edge px-6 py-12 text-center">
      <p className="text-sm font-medium text-body">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-faint">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Horizontal fill bar used for occupancy and utilisation. */
export function Meter({
  pct,
  tone = "brand",
  className = "",
}: {
  pct: number;
  tone?: Tone;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  // A caller-supplied width has to win. Tailwind resolves competing utilities
  // by stylesheet order, not by the order they appear in the attribute, so
  // "w-full w-24" would silently render full width.
  const width = /(^|\s)(w-|max-w-|flex-1)/.test(className) ? "" : "w-full";
  const fill =
    tone === "flame"
      ? "bg-flame"
      : tone === "amber"
        ? "bg-amber"
        : tone === "sky"
          ? "bg-sky"
          : "bg-brand";

  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-raised ${width} ${className}`}
      role="meter"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

const TRIP_STATUS: Record<string, { label: string; tone: Tone }> = {
  scheduled: { label: "Scheduled", tone: "neutral" },
  boarding: { label: "Boarding", tone: "amber" },
  in_transit: { label: "On the road", tone: "brand" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "flame" },
};

export function TripStatusBadge({ status }: { status: string }) {
  const meta = TRIP_STATUS[status] ?? TRIP_STATUS.scheduled;
  return (
    <Badge tone={meta.tone}>
      {status === "in_transit" ? (
        <span className="size-1.5 animate-pulse rounded-full bg-brand-bright" />
      ) : null}
      {meta.label}
    </Badge>
  );
}

const BOOKING_STATUS: Record<string, { label: string; tone: Tone }> = {
  booked: { label: "Seat held", tone: "sky" },
  boarded: { label: "Boarded", tone: "brand" },
  no_show: { label: "No-show", tone: "amber" },
  cancelled: { label: "Cancelled", tone: "flame" },
};

export function BookingStatusBadge({ status }: { status: string }) {
  const meta = BOOKING_STATUS[status] ?? BOOKING_STATUS.booked;
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function DirectionBadge({ direction }: { direction: string }) {
  return (
    <Badge tone={direction === "inbound" ? "sky" : "amber"}>
      {direction === "inbound" ? "→ To work" : "← To home"}
    </Badge>
  );
}
