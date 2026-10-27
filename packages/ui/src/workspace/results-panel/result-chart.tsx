import type { StatementResult } from "@dipper/protocol";
import * as React from "react";
import { plural } from "../../lib/format";
import { Button } from "../../ui/button";
import { type ChartKind, MAX_POINTS, defaultColumns, formatValue, numericColumns, pointsOf, scale, ticks, valueRange } from "./chart-model";

const MARGIN = { top: 16, right: 16, bottom: 44, left: 52 };
/** The smallest the plot is drawn: below this a chart is unreadable, so it scrolls instead. */
const MIN_W = 320;
const MIN_H = 110;

const SELECT =
  "h-7 max-w-40 rounded-md border border-input bg-background px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A result as a bar or line chart: one number column for the height, any column for the labels. */
export function ResultChart({ result }: { result: StatementResult }): React.ReactElement {
  const numeric = React.useMemo(() => numericColumns(result.columns, result.rows), [result.columns, result.rows]);
  const defaults = React.useMemo(() => defaultColumns(result.columns.length, numeric), [result.columns.length, numeric]);
  const [kind, setKind] = React.useState<ChartKind>("bar");
  const [valueColumn, setValueColumn] = React.useState(defaults.value);
  const [labelColumn, setLabelColumn] = React.useState(defaults.label);

  // The chart is drawn at the size it is given: a fixed shape would shrink to a thumbnail in a
  // short pane, with its text shrunk along with it.
  const [size, setSize] = React.useState({ w: 800, h: 320 });
  const observer = React.useRef<ResizeObserver | null>(null);
  // A callback ref, because the box only exists once there are points to draw: it attaches the
  // observer whenever the element appears and lets go when it goes.
  const frame = React.useCallback((element: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!element) return;
    observer.current = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ w: Math.max(MIN_W, Math.floor(entry.contentRect.width)), h: Math.max(MIN_H, Math.floor(entry.contentRect.height)) });
    });
    observer.current.observe(element);
  }, []);
  const W = size.w;
  const H = size.h;
  const PLOT_W = W - MARGIN.left - MARGIN.right;
  const PLOT_H = H - MARGIN.top - MARGIN.bottom;

  const label = Math.max(0, labelColumn);
  const allPoints = React.useMemo(() => pointsOf(result.rows, label, valueColumn), [result.rows, label, valueColumn]);
  const points = allPoints.slice(0, MAX_POINTS);
  const range = React.useMemo(() => valueRange(points, kind), [points, kind]);
  const axis = ticks(range);

  const step = PLOT_W / Math.max(1, points.length);
  const x = (index: number): number => MARGIN.left + step * (index + 0.5);
  const y = (value: number): number => MARGIN.top + PLOT_H * (1 - scale(value, range));
  const zero = y(Math.max(range.min, Math.min(0, range.max)));
  // A label every few bars once they would collide.
  const every = Math.max(1, Math.ceil(points.length / 12));

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <label className="flex items-center gap-1.5">
          Height
          <select className={SELECT} onChange={(e) => setValueColumn(Number(e.target.value))} value={valueColumn}>
            {numeric.map((i) => (
              <option key={i} value={i}>
                {result.columns[i]?.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Labels
          <select className={SELECT} onChange={(e) => setLabelColumn(Number(e.target.value))} value={label}>
            {result.columns.map((c, i) => (
              <option key={i} value={i}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <span className="flex gap-1">
          {(["bar", "line"] as const).map((k) => (
            <Button aria-pressed={kind === k} key={k} onClick={() => setKind(k)} size="xs" variant={kind === k ? "secondary" : "ghost"}>
              {k === "bar" ? "Bars" : "Line"}
            </Button>
          ))}
        </span>
        {allPoints.length > MAX_POINTS && (
          <span>Showing the first {MAX_POINTS} of {plural(allPoints.length, "point")}.</span>
        )}
      </div>

      {points.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to plot: that column has no numbers.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto" ref={frame}>
        <svg aria-label={`${result.columns[valueColumn]?.name} by ${result.columns[label]?.name}`} height={H} role="img" viewBox={`0 0 ${W} ${H}`} width={W}>
          {axis.map((tick) => (
            <g key={tick}>
              <line className="stroke-border" strokeDasharray="3 3" x1={MARGIN.left} x2={W - MARGIN.right} y1={y(tick)} y2={y(tick)} />
              <text className="fill-muted-foreground text-xs" dominantBaseline="middle" textAnchor="end" x={MARGIN.left - 6} y={y(tick)}>
                {formatValue(tick)}
              </text>
            </g>
          ))}
          {kind === "bar" ? (
            points.map((p, i) => {
              const top = y(Math.max(p.value, 0));
              const height = Math.abs(y(p.value) - zero);
              return (
                <rect className="fill-primary" height={Math.max(1, height)} key={i} rx={2} width={Math.max(1, step * 0.7)} x={x(i) - step * 0.35} y={p.value >= 0 ? top : zero}>
                  <title>{`${p.label}: ${p.value.toLocaleString()}`}</title>
                </rect>
              );
            })
          ) : (
            <>
              <polyline className="fill-none stroke-primary" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} strokeLinejoin="round" strokeWidth={2} />
              {points.map((p, i) => (
                <circle className="fill-primary" cx={x(i)} cy={y(p.value)} key={i} r={3}>
                  <title>{`${p.label}: ${p.value.toLocaleString()}`}</title>
                </circle>
              ))}
            </>
          )}
          {points.map((p, i) =>
            i % every === 0 ? (
              <text className="fill-muted-foreground text-xs" key={i} textAnchor="middle" x={x(i)} y={H - MARGIN.bottom + 16}>
                {p.label.length > 12 ? `${p.label.slice(0, 11)}…` : p.label}
              </text>
            ) : null,
          )}
        </svg>
        </div>
      )}
    </div>
  );
}
