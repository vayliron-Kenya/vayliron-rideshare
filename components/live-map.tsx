"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { PositionPayload } from "@/lib/position";

const POLL_MS = 15000;
const VIEW_W = 720;
const VIEW_H = 420;
const PAD = 44;

export function LiveMap({
  initial,
  highlightStopId,
}: {
  initial: PositionPayload;
  /** The rider's own boarding stage, drawn larger than the rest. */
  highlightStopId?: string;
}) {
  const [data, setData] = useState(initial);
  const [stale, setStale] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/trips/${initial.tripId}/position`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as PositionPayload;
        if (!cancelled) {
          setData(next);
          setStale(false);
        }
      } catch {
        if (!cancelled) setStale(true);
      }
    }

    timer.current = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [initial.tripId]);

  const projected = useMemo(() => project(data, highlightStopId), [data, highlightStopId]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
      <div className="overflow-hidden rounded-2xl border border-line bg-ink">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="flex items-center gap-2 text-xs text-muted">
            <span
              className={`size-1.5 rounded-full ${
                data.state === "en_route" ? "animate-pulse bg-brand-bright" : "bg-edge"
              }`}
            />
            {stateLabel(data)}
          </span>
          <span className="text-[11px] text-faint">
            {data.source === "tracker" ? "On-board tracker" : "Timetable estimate"}
            {stale ? " · reconnecting" : ""}
          </span>
        </div>

        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Live position on the line, ${stateLabel(data)}`}
        >
          <defs>
            {/* The brand gradient from vayliron.com: primary into secondary. */}
            <linearGradient id="routeLine" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-bright)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0.95" />
            </linearGradient>
          </defs>

          {/* Corridor */}
          <polyline
            points={projected.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="url(#routeLine)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Distance already covered */}
          <polyline
            points={projected.travelled.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--color-brand-bright)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.35"
          />

          {projected.points.map((point, index) => {
            const stop = data.stops[index];
            const passed = stop.etaMinutes <= 0;
            const isHighlight = stop.id === highlightStopId;
            const isEnd = index === 0 || index === data.stops.length - 1;
            const label = projected.labels.get(index);

            return (
              <g key={stop.id}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isHighlight ? 7 : isEnd ? 5.5 : 4}
                  fill={
                    isHighlight
                      ? "var(--color-amber)"
                      : passed
                        ? "var(--color-edge)"
                        : "var(--color-surface)"
                  }
                  stroke={
                    isHighlight
                      ? "var(--color-amber)"
                      : passed
                        ? "var(--color-brand-bright)"
                        : "var(--color-faint)"
                  }
                  strokeWidth="2"
                >
                  <title>{`${stop.name} — ${stop.time}`}</title>
                </circle>

                {label ? (
                  <>
                    <text
                      x={point.x}
                      y={point.y + (label.above ? -14 : 20)}
                      textAnchor="middle"
                      fill={isHighlight ? "var(--color-amber)" : "var(--color-muted)"}
                      fontSize="11"
                      fontWeight={isHighlight || isEnd ? 600 : 400}
                    >
                      {stop.name}
                    </text>
                    <text
                      x={point.x}
                      y={point.y + (label.above ? -3 : 31)}
                      textAnchor="middle"
                      fill="var(--color-faint)"
                      fontSize="10"
                    >
                      {stop.time}
                    </text>
                  </>
                ) : null}
              </g>
            );
          })}

          {/* The bus */}
          <g
            transform={`translate(${projected.bus.x} ${projected.bus.y})`}
            style={{ transition: "transform 900ms linear" }}
          >
            <circle r="13" fill="var(--color-brand)" opacity="0.22" />
            <circle
              r="8"
              fill="var(--color-brand)"
              stroke="var(--color-ink)"
              strokeWidth="2"
            />
            <path d="M -3 -2 h 6 v 4 h -6 z" fill="var(--color-on-brand)" />
          </g>
        </svg>
      </div>

      <div className="rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <p className="text-xs uppercase tracking-wider text-faint">Next stage</p>
          {data.nextStop ? (
            <>
              <p className="mt-1 text-lg font-semibold text-body">{data.nextStop.name}</p>
              <p className="mt-0.5 text-sm text-accent">
                {data.nextStop.etaMinutes <= 0
                  ? "Arriving now"
                  : `${inWords(data.nextStop.etaMinutes)} · scheduled ${data.nextStop.time}`}
              </p>
            </>
          ) : (
            <p className="mt-1 text-lg font-semibold text-body">Trip complete</p>
          )}
          <p className="tabular mt-2 text-xs text-faint">
            {Math.round(data.progress * 100)}% of the run · {data.speedKph} km/h
          </p>
        </div>

        <ol className="max-h-[22rem] overflow-y-auto p-2">
          {data.stops.map((stop) => {
            const passed = stop.etaMinutes <= 0;
            const isNext = stop.id === data.nextStop?.id;
            return (
              <li
                key={stop.id}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                  isNext ? "bg-brand-soft/60" : ""
                }`}
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    passed ? "bg-edge" : isNext ? "bg-brand-bright" : "bg-muted/40"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm ${
                      passed ? "text-faint line-through" : "text-body"
                    }`}
                  >
                    {stop.name}
                  </p>
                  <p className="truncate text-[11px] text-faint">{stop.landmark}</p>
                </div>
                <div className="text-right">
                  <p className="tabular text-xs text-muted">{stop.time}</p>
                  <p
                    className={`tabular text-[11px] ${
                      passed ? "text-edge" : "text-accent"
                    }`}
                  >
                    {passed ? "passed" : untilLabel(stop.etaMinutes)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

interface Point {
  x: number;
  y: number;
}

/**
 * Fits the line's coordinates into the SVG box.
 *
 * Longitude degrees shrink with latitude, but Nairobi sits within 1.5° of the
 * equator where that factor is 0.9997 — far below the width of the drawn line,
 * so a plain linear fit is honest here.
 */
function project(
  data: PositionPayload,
  highlightStopId?: string,
): {
  points: Point[];
  travelled: Point[];
  bus: Point;
  labels: Map<number, { above: boolean }>;
} {
  const lats = data.stops.map((s) => s.lat);
  const lngs = data.stops.map((s) => s.lng);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const spanLat = Math.max(maxLat - minLat, 1e-6);
  const spanLng = Math.max(maxLng - minLng, 1e-6);

  // Preserve the corridor's shape rather than stretching it to fill the box.
  const scale = Math.min((VIEW_W - PAD * 2) / spanLng, (VIEW_H - PAD * 2) / spanLat);
  const offsetX = (VIEW_W - spanLng * scale) / 2;
  const offsetY = (VIEW_H - spanLat * scale) / 2;

  const toPoint = (lat: number, lng: number): Point => ({
    x: offsetX + (lng - minLng) * scale,
    // Screen y grows downwards; latitude grows northwards.
    y: offsetY + (maxLat - lat) * scale,
  });

  const points = data.stops.map((s) => toPoint(s.lat, s.lng));
  const bus = toPoint(data.position.lat, data.position.lng);

  const passedCount = data.stops.filter((s) => s.etaMinutes <= 0).length;
  const travelled = passedCount > 0 ? [...points.slice(0, passedCount), bus] : [];

  return { points, travelled, bus, labels: placeLabels(points, data, highlightStopId) };
}

/**
 * Minimum gap between two drawn labels. Measured between the stage markers
 * rather than the text boxes, so it is set generously — stage names such as
 * "CBD · Kencom" are far wider than the dot they hang off.
 */
const LABEL_CLEARANCE = 68;

/**
 * Decides which stages get a printed name.
 *
 * Nairobi corridors bunch up badly near the centre — Ngara, Kencom and Upper
 * Hill land within a few pixels of one another — so labelling every stage
 * produces an unreadable pile. The terminals and the rider's own stage are
 * always named; the rest are dropped as soon as they would overlap something
 * already placed. Every stage still carries its name in a tooltip.
 */
function placeLabels(
  points: Point[],
  data: PositionPayload,
  highlightStopId?: string,
): Map<number, { above: boolean }> {
  const labels = new Map<number, { above: boolean }>();
  const placed: Point[] = [];

  const clearOf = (point: Point) =>
    placed.every((other) => Math.hypot(other.x - point.x, other.y - point.y) >= LABEL_CLEARANCE);

  const claim = (index: number) => {
    // Alternate sides so consecutive labels lean away from each other.
    labels.set(index, { above: placed.length % 2 === 0 });
    placed.push(points[index]);
  };

  const mandatory = new Set<number>([0, points.length - 1]);
  const highlightIndex = data.stops.findIndex((s) => s.id === highlightStopId);
  if (highlightIndex >= 0) mandatory.add(highlightIndex);

  for (const index of [...mandatory].sort((a, b) => a - b)) claim(index);

  for (let index = 0; index < points.length; index += 1) {
    if (labels.has(index)) continue;
    if (clearOf(points[index])) claim(index);
  }

  return labels;
}

/**
 * "739 min" is a number nobody converts in their head at a bus stage. Anything
 * inside the hour stays in minutes, because that is the range a rider is
 * actually counting down; past it, hours and then days.
 */
function inWords(minutes: number): string {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

/** The same scale, tightened for the column beside each stage. */
function untilLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function stateLabel(data: PositionPayload): string {
  if (data.status === "cancelled") return "Departure cancelled";
  switch (data.state) {
    case "not_departed":
      return `Departs ${inWords(Math.abs(data.minutesSinceDeparture))}`;
    case "arrived":
      return "Arrived at destination";
    default:
      return "On the road";
  }
}
