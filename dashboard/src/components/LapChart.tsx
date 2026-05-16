import { useMemo, useState } from "react";
import type { LtsResultEntry, LtsSnapshot } from "../types";
import { lapTotalMs, type LapWithDriver } from "../lib/state";
import { classColor } from "../lib/classes";
import { formatDriverName } from "../lib/format";

// Stint-chart style grid: rows = cars (filtered), columns = lap 1..N.
// Cells coloured by lap pace relative to that car's median:
//   < median*0.99   → green tint  (faster than usual)
//   > median*1.06   → red tint    (much slower than usual)
//   pit-flagged     → amber tint  (T != "00.000" OR lap > median*1.15)
//   otherwise       → neutral

const STNR_COL_W = 200; // px — accommodates start number + driver name
const LAP_COL_W = 14; // px

interface CarRow {
  entry: LtsResultEntry;
  laps: LapWithDriver[];
  totals: (number | null)[]; // parallel to laps
  median: number | null;
}

function median(values: number[]): number | null {
  const xs = values.slice().sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2);
}

type CellKind = "fast" | "slow" | "neutral" | "pit" | "empty";

function classifyCell(
  totalMs: number | null,
  med: number | null,
  T: string,
): CellKind {
  if (totalMs == null) return "empty";
  // Pit-flagged: T present and non-zero, or huge outlier (>15% slower than median)
  const tIsPit = T && T !== "00.000" && Number.parseFloat(T) > 0;
  if (med != null && totalMs > med * 1.15) return "pit";
  if (tIsPit) return "pit";
  if (med == null) return "neutral";
  if (totalMs < med * 0.99) return "fast";
  if (totalMs > med * 1.06) return "slow";
  return "neutral";
}

function cellClass(kind: CellKind): string {
  switch (kind) {
    case "fast":
      return "bg-emerald-500/40";
    case "slow":
      return "bg-red-500/40";
    case "neutral":
      return "bg-zinc-500/30";
    case "pit":
      return "bg-amber-500/50";
    case "empty":
      return "bg-zinc-900";
  }
}

function fmtTotal(ms: number | null): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  if (s < 60) return s.toFixed(3);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(3).padStart(6, "0")}`;
}

export function LapChart(props: {
  snapshot: LtsSnapshot;
  filteredEntries: LtsResultEntry[];
  lapsByCar: Map<number, LapWithDriver[]>;
}) {
  const { filteredEntries, lapsByCar } = props;
  const [hover, setHover] = useState<
    { stnr: string; total: number | null; lap: LapWithDriver } | null
  >(null);

  const rows: CarRow[] = useMemo(() => {
    const out: CarRow[] = [];
    for (const e of filteredEntries) {
      const stnr = Number.parseInt(e.STNR, 10);
      const laps = Number.isFinite(stnr) ? lapsByCar.get(stnr) ?? [] : [];
      const totals = laps.map(lapTotalMs);
      const validForMedian = totals.filter((t): t is number => t != null);
      out.push({
        entry: e,
        laps,
        totals,
        median: median(validForMedian),
      });
    }
    return out;
  }, [filteredEntries, lapsByCar]);

  const maxLap = useMemo(() => {
    let m = 0;
    for (const r of rows) {
      for (const l of r.laps) if (l.L > m) m = l.L;
    }
    return m;
  }, [rows]);

  if (maxLap === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="text-base font-semibold text-zinc-200">
          No lap events received yet
        </div>
        <div className="max-w-md text-xs text-f1-dim">
          The lap chart fills in as PID=7 (TYPE=0) events arrive. The server
          only emits these once a car crosses the line after the WS opens —
          laps completed before our connection are not back-filled.
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-f1-divider px-6 py-2 text-[11px] text-f1-dim">
        <span>
          <span className="font-bold text-zinc-200">Lap chart</span>
          <span className="ml-2">
            {rows.length} cars · columns 1..{maxLap}
          </span>
        </span>
        <span className="flex items-center gap-3">
          <Legend kind="fast" label="faster than median" />
          <Legend kind="neutral" label="near median" />
          <Legend kind="slow" label="slower" />
          <Legend kind="pit" label="pit / outlier" />
        </span>
      </div>
      <div className="timing-scroll flex-1 overflow-auto">
        <table className="border-collapse">
          <thead className="sticky top-0 z-10 bg-f1-panel">
            <tr>
              <th
                className="sticky left-0 z-20 bg-f1-panel px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-f1-dim"
                style={{ minWidth: STNR_COL_W, width: STNR_COL_W }}
              >
                # · Driver
              </th>
              {Array.from({ length: maxLap }).map((_, i) => (
                <th
                  key={i}
                  className="px-0 py-1 text-center text-[9px] text-f1-dim"
                  style={{ width: LAP_COL_W, minWidth: LAP_COL_W }}
                >
                  {(i + 1) % 5 === 0 || i === 0 ? i + 1 : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.entry.STNR}>
                <td
                  className="sticky left-0 z-10 whitespace-nowrap bg-f1-panel px-2 py-0.5 font-mono text-[11px]"
                  style={{ minWidth: STNR_COL_W, width: STNR_COL_W }}
                >
                  <span
                    className="mr-1 inline-block h-3 w-1 rounded-sm align-middle"
                    style={{ backgroundColor: classColor(r.entry.CLASSNAME) }}
                  />
                  <span className="font-bold text-zinc-100">#{r.entry.STNR}</span>{" "}
                  <span className="text-zinc-400">
                    {formatDriverName(r.entry.NAME)}
                  </span>
                </td>
                {Array.from({ length: maxLap }).map((_, i) => {
                  const lapNo = i + 1;
                  const lap = r.laps.find((l) => l.L === lapNo);
                  const total = lap ? lapTotalMs(lap) : null;
                  const T = lap?.T ?? "";
                  const kind = classifyCell(total, r.median, T);
                  return (
                    <td
                      key={i}
                      className={`border border-zinc-900 ${cellClass(kind)}`}
                      style={{ width: LAP_COL_W, minWidth: LAP_COL_W, height: 14 }}
                      onMouseEnter={() =>
                        lap &&
                        setHover({
                          stnr: r.entry.STNR,
                          total,
                          lap,
                        })
                      }
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hover ? <HoverCell info={hover} /> : null}
    </div>
  );
}

function Legend(props: { kind: CellKind; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-sm ${cellClass(props.kind)}`} />
      {props.label}
    </span>
  );
}

function HoverCell(props: {
  info: { stnr: string; total: number | null; lap: LapWithDriver };
}) {
  const { stnr, lap, total } = props.info;
  return (
    <div className="pointer-events-none fixed right-6 top-24 z-50 w-80 rounded-md border border-zinc-700 bg-f1-panel p-3 text-[11px] shadow-2xl">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-bold text-white">
          #{stnr} · Lap {lap.L}
        </span>
        <span className="font-mono text-zinc-200">{fmtTotal(total)}</span>
      </div>
      <div className="mb-1 text-[10px] text-f1-dim">
        Driver:{" "}
        <span className="text-zinc-200">
          {formatDriverName(lap.driverName) || "—"}
        </span>
        {lap.T && lap.T !== "00.000" ? (
          <span className="ml-2 text-amber-300">T={lap.T}</span>
        ) : null}
      </div>
      <table className="w-full font-mono text-[10px] tabular-nums">
        <thead>
          <tr className="text-f1-dim">
            {lap.sectors.map((_, i) => (
              <th key={i} className="text-center">
                S{i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {lap.sectors.map((s, i) => (
              <td key={i} className="text-center text-zinc-200">
                {s && s !== "00.000" ? s : "—"}
              </td>
            ))}
          </tr>
          <tr className="text-f1-dim">
            {lap.speeds.map((v, i) => (
              <td key={i} className="text-center">
                {v || "—"}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
