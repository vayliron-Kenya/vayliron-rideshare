import Link from "next/link";

import { Badge, EmptyState } from "@/components/ui";
import type { AuditEvent } from "@/lib/audit";

const ACTOR_TONE = {
  operator: "sky",
  driver: "amber",
  owner: "flame",
  employee: "brand",
  system: "neutral",
} as const;

const ACTOR_LABEL = {
  operator: "Control",
  driver: "Driver",
  owner: "Owner",
  employee: "Client",
  system: "System",
} as const;

/** Actions that undo or remove something read differently at a glance. */
const DESTRUCTIVE = new Set([
  "trip.cancel",
  "employee.deactivate",
  "driver.stand_down",
  "route.suspend",
]);

const STAMP = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Nairobi",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function AuditList({
  events,
  linkTrips = false,
  emptyTitle = "Nothing recorded yet",
  emptyBody = "Administrative changes appear here as they are made.",
}: {
  events: AuditEvent[];
  /** Link trip entries through to the control view. Not for client eyes. */
  linkTrips?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  if (events.length === 0) {
    return (
      <div className="p-5">
        <EmptyState title={emptyTitle} body={emptyBody} />
      </div>
    );
  }

  return (
    <ol className="divide-y divide-line">
      {events.map((event) => (
        <li key={event.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5">
          <span className="tabular w-24 shrink-0 pt-0.5 text-xs text-faint">
            {STAMP.format(new Date(event.at))}
          </span>

          <Badge tone={ACTOR_TONE[event.actorKind]}>{ACTOR_LABEL[event.actorKind]}</Badge>

          <div className="min-w-[16rem] flex-1">
            <p
              className={`text-sm ${
                DESTRUCTIVE.has(event.action) ? "text-flame" : "text-body"
              }`}
            >
              {event.summary}
            </p>
            <p className="mt-0.5 text-xs text-faint">
              {event.actorName} ·{" "}
              {linkTrips && event.subjectKind === "trip" ? (
                <Link
                  href={`/ops/trips/${event.subjectId}`}
                  className="transition-colors hover:text-accent"
                >
                  {event.subjectLabel}
                </Link>
              ) : (
                event.subjectLabel
              )}
            </p>
          </div>

          <span className="shrink-0 pt-0.5 font-mono text-[11px] text-edge">{event.action}</span>
        </li>
      ))}
    </ol>
  );
}
