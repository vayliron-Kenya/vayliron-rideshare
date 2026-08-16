import { ArrowIcon, BusIcon, ClockIcon, PinIcon } from "@/components/icons";
import type { DepartureCue, SiblingBus, StageCall } from "@/lib/dispatch";

/**
 * The top of a driver's screen while the engine is running.
 *
 * A driver at a stage is not reading; they are glancing. So the whole state of
 * the run is compressed into one instruction in the largest type on the page —
 * hold, go, or you are late — with the next pick-up and the next set-down
 * underneath it, and the rest of the line drawn as a strip so bunching is
 * visible without counting.
 */

const CUE_SKIN: Record<DepartureCue["cue"], string> = {
  hold: "bg-amber-soft border-amber/40 text-amber",
  go: "brand-wash border-transparent text-white",
  late: "bg-flame-soft border-flame/40 text-flame",
  done: "bg-raised border-edge text-muted",
};

export function DriverCue({
  cue,
  pickup,
  dropoff,
}: {
  cue: DepartureCue;
  pickup: StageCall | null;
  dropoff: StageCall | null;
}) {
  return (
    <section className="space-y-3">
      <div className={`rounded-3xl border-2 p-5 ${CUE_SKIN[cue.cue]}`}>
        <p
          className={`text-xs font-bold uppercase tracking-[0.16em] ${
            cue.cue === "go" ? "text-white/70" : "opacity-70"
          }`}
        >
          {cue.cue === "hold"
            ? "Wait"
            : cue.cue === "late"
              ? "Behind schedule"
              : cue.cue === "done"
                ? "Run state"
                : "Next"}
        </p>
        <p className="mt-1 text-3xl font-bold leading-tight tracking-tight">{cue.headline}</p>
        <p className={`mt-1.5 text-base leading-relaxed ${cue.cue === "go" ? "text-white/85" : ""}`}>
          {cue.detail}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StageTile
          kind="Pick up"
          icon={<PinIcon className="size-5" />}
          stage={pickup}
          count={pickup?.boarding ?? 0}
          empty="Nobody else booked to get on"
          tone="brand"
        />
        <StageTile
          kind="Set down"
          icon={<ArrowIcon className="size-5" />}
          stage={dropoff}
          count={dropoff?.alighting ?? 0}
          empty="Nobody left to drop"
          tone="flame"
        />
      </div>
    </section>
  );
}

function StageTile({
  kind,
  icon,
  stage,
  count,
  empty,
  tone,
}: {
  kind: string;
  icon: React.ReactNode;
  stage: StageCall | null;
  count: number;
  empty: string;
  tone: "brand" | "flame";
}) {
  const accent = tone === "brand" ? "bg-brand-soft text-accent" : "bg-flame-soft text-flame";

  return (
    <div className="rounded-2xl border border-line bg-surface/80 p-4">
      <div className="flex items-center gap-2.5">
        <span className={`flex size-8 items-center justify-center rounded-lg ${accent}`}>
          {icon}
        </span>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-faint">{kind}</p>
      </div>

      {stage ? (
        <>
          <p className="mt-2.5 truncate text-xl font-bold tracking-tight text-body">
            {stage.name}
          </p>
          <p className="truncate text-sm text-muted">{stage.landmark}</p>
          <p className="tabular mt-2 flex items-center gap-2 text-sm text-body">
            <ClockIcon className="size-4 shrink-0 text-faint" />
            {stage.time}
            <span className="text-faint">·</span>
            <span className="font-semibold">
              {count} {count === 1 ? "person" : "people"}
            </span>
          </p>
        </>
      ) : (
        <p className="mt-2.5 text-base leading-relaxed text-muted">{empty}</p>
      )}
    </div>
  );
}

/**
 * Every bus on this line, drawn along the corridor.
 *
 * Bunching is the corridor's real failure mode — three buses nose to tail and
 * then a twenty-minute hole — and it is invisible in a list of departure times
 * but obvious the moment the buses are plotted on the same line.
 */
export function CorridorStrip({
  mine,
  others,
  fromName,
  toName,
}: {
  mine: number;
  others: SiblingBus[];
  fromName: string;
  toName: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface/80 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-body">Others on this line</h2>
        <span className="text-xs text-faint">
          {others.length === 0
            ? "You are the only one out"
            : `${others.length} more running`}
        </span>
      </div>

      <div className="relative mt-6 mb-2 h-2 rounded-full bg-raised">
        <span className="absolute inset-y-0 left-0 w-full rounded-full bg-gradient-to-r from-brand-soft to-transparent" />

        {others.map((bus) => (
          <span
            key={bus.tripId}
            className="absolute -top-1 size-4 -translate-x-1/2 rounded-full border-2 border-surface bg-muted"
            style={{ left: `${clamp(bus.progressPct)}%` }}
            title={`${bus.plate} · ${bus.driverName}`}
          />
        ))}

        <span
          className="absolute -top-2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-surface bg-brand text-on-brand"
          style={{ left: `${clamp(mine)}%` }}
          title="You"
        >
          <BusIcon className="size-3.5" />
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-faint">
        <span className="truncate">{fromName}</span>
        <span className="truncate">{toName}</span>
      </div>

      {others.length > 0 ? (
        <ul className="mt-4 divide-y divide-line">
          {others.map((bus) => (
            <li key={bus.tripId} className="flex items-center gap-3 py-2.5">
              <span className="tabular w-14 shrink-0 text-sm font-semibold text-body">
                {bus.departTime}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-body">
                  {bus.plate} · {bus.driverName}
                </span>
                <span className="block truncate text-xs text-faint">
                  {bus.nextStopName ? `heading for ${bus.nextStopName}` : "at the terminus"}
                  {bus.delayMinutes > 0 ? ` · ${bus.delayMinutes} min late` : ""}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  bus.gapPct > 0
                    ? "bg-raised text-muted"
                    : "bg-amber-soft text-amber"
                }`}
              >
                {gapLabel(bus.gapPct)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Ahead or behind, said the way a driver would say it. */
function gapLabel(gapPct: number): string {
  if (Math.abs(gapPct) <= 3) return "alongside";
  return gapPct > 0 ? `${gapPct}% ahead` : `${Math.abs(gapPct)}% behind`;
}

function clamp(pct: number): number {
  return Math.min(100, Math.max(0, pct));
}
