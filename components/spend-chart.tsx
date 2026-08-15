import { formatKes } from "@/lib/domain/fares";
import { formatServiceDate } from "@/lib/domain/time";

export interface SpendPoint {
  date: string;
  kes: number;
  trips: number;
}

const W = 760;
const H = 200;
/** Gutter reserved for the value axis, so labels never sit on top of a bar. */
const AXIS_W = 38;
const PAD_R = 8;
const PAD_B = 26;
const PAD_T = 12;

/**
 * Daily employer spend. Rendered as plain SVG on the server — a chart this
 * simple does not justify shipping a plotting library to the browser.
 */
export function SpendChart({ points }: { points: SpendPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-faint">
        No spend recorded in this period.
      </p>
    );
  }

  const max = Math.max(...points.map((p) => p.kes), 1);
  const usableW = W - AXIS_W - PAD_R;
  const usableH = H - PAD_B - PAD_T;
  const slot = usableW / points.length;
  const barW = Math.max(2, Math.min(26, slot * 0.62));

  const total = points.reduce((sum, p) => sum + p.kes, 0);
  const busiest = points.reduce((best, p) => (p.kes > best.kes ? p : best), points[0]);

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="tabular text-2xl font-semibold text-body">{formatKes(total)}</p>
        <p className="text-xs text-faint">
          Peak day {formatServiceDate(busiest.date)} · {formatKes(busiest.kes)}
        </p>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" role="img" aria-label="Daily employer spend">
        {[0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = PAD_T + usableH * (1 - fraction);
          return (
            <g key={fraction}>
              <line x1={AXIS_W} y1={y} x2={W - PAD_R} y2={y} className="stroke-edge" strokeOpacity="0.6" strokeWidth="1" />
              <text x={AXIS_W - 6} y={y + 3} textAnchor="end" className="fill-faint" fontSize="10">
                {formatAxis(max * fraction)}
              </text>
            </g>
          );
        })}

        {points.map((point, index) => {
          const height = Math.max(1, (point.kes / max) * usableH);
          const x = AXIS_W + slot * index + (slot - barW) / 2;
          const y = PAD_T + usableH - height;
          const isPeak = point.date === busiest.date;

          return (
            <g key={point.date}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={height}
                rx={Math.min(3, barW / 2)}
                className={isPeak ? "fill-brand-bright" : "fill-brand"}
                opacity={isPeak ? 1 : 0.72}
              >
                <title>
                  {formatServiceDate(point.date)} — {formatKes(point.kes)} across {point.trips}{" "}
                  bookings
                </title>
              </rect>
              {index % Math.ceil(points.length / 8) === 0 ? (
                <text
                  x={x + barW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-faint"
                  fontSize="10"
                >
                  {point.date.slice(5)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Compact axis ticks: 40860 -> "41k", 820 -> "820". */
function formatAxis(value: number): string {
  return value >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value));
}
