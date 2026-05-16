import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LtsResultEntry, LtsSnapshot } from "../types";
import { classColor } from "../lib/classes";
import { formatDriverName, fmtGap, fmtTime } from "../lib/format";
import {
  NURBURGRING_PATH,
  NURBURGRING_START,
  NURBURGRING_VIEWBOX,
} from "../lib/nordschleife";
import {
  estimateCarPosition,
  trackGeometryFromSnapshot,
  type CarPosState,
  type TrackGeometry,
} from "../lib/trackGeometry";
import type { Code60State, ActiveZone } from "../lib/code60";
import {
  MARSHAL_LAP_TOTAL_M,
  getMarshalPost,
  type MarshalPost,
} from "../lib/zones";

const DOT_RADIUS = 12;
const PIT_LANE_Y = NURBURGRING_VIEWBOX.height - 30;
const PIT_LANE_X = 60;
const PIT_LANE_W = NURBURGRING_VIEWBOX.width - 120;

interface DotHandles {
  group: SVGGElement;
  circle: SVGCircleElement;
  label: SVGTextElement;
}

export function TrackMap(props: {
  snapshot: LtsSnapshot;
  filteredEntries: LtsResultEntry[];
  code60: Code60State | null;
}) {
  const { snapshot, filteredEntries, code60 } = props;
  const pathRef = useRef<SVGPathElement | null>(null);
  const dotsRef = useRef<Map<string, DotHandles>>(new Map());
  const pathLengthRef = useRef<number>(0);
  // Force a re-render once the path element is mounted so the sector tint
  // memo (which depends on pathLength) can read it.
  const [pathLen, setPathLen] = useState(0);
  // Snapshot the most recent entries for each car so the RAF loop sees fresh
  // LASTIMTIME / sector-time values even between React renders.
  const entryRef = useRef<Map<string, LtsResultEntry>>(new Map());

  const geom = useMemo(() => trackGeometryFromSnapshot(snapshot), [snapshot]);

  const sectorSummary = useMemo(
    () => summarizeZonesBySector(code60?.active ?? [], geom),
    [code60?.active, geom],
  );
  const zoneArcs = useMemo(
    () => (pathLen > 0 ? buildZoneArcs(code60?.active ?? [], geom, pathLen) : []),
    [code60?.active, geom, pathLen],
  );

  // Stable ordered list of cars we expect to render. Order doesn't matter
  // visually (cars are positioned absolutely on the track) but a stable order
  // keeps the SVG DOM happy with refs.
  const carRows = useMemo(() => {
    return filteredEntries
      .filter((e) => e.STNR && e.STNR.length > 0)
      .sort((a, b) => a.STNR.localeCompare(b.STNR));
  }, [filteredEntries]);

  // Keep the entry ref in sync with the latest snapshot — by start number.
  useEffect(() => {
    const next = new Map<string, LtsResultEntry>();
    for (const e of carRows) next.set(e.STNR, e);
    entryRef.current = next;
  }, [carRows]);

  // Capture path length once we have a path element. Re-measure if the path
  // string ever changes (it doesn't today, but no harm).
  useEffect(() => {
    if (!pathRef.current) return;
    const len = pathRef.current.getTotalLength();
    pathLengthRef.current = len;
    setPathLen(len);
  }, []);

  // Sector boundary points along the path, recomputed when sector lengths
  // change. Used to draw the small tick marks separating sectors.
  const sectorTicks = useMemo(() => {
    const path = pathRef.current;
    const pathLen = pathLengthRef.current;
    if (!path || !pathLen || geom.total <= 0) return [];
    const out: { x: number; y: number; idx: number }[] = [];
    // geom.cumulative[k] for k=1..N-1 are the intermediate marker positions
    // (k=0 is the start/finish which we draw separately).
    for (let k = 1; k < geom.cumulative.length - 1; k++) {
      const frac = geom.cumulative[k] / geom.total;
      const p = path.getPointAtLength(frac * pathLen);
      out.push({ x: p.x, y: p.y, idx: k });
    }
    return out;
  }, [geom]);

  // RAF loop: every frame, recompute each car's distance using the current
  // wall-clock time and update its dot position imperatively. We avoid React
  // re-renders here because ~150 dots × 60fps would be wasteful.
  useEffect(() => {
    let frame = 0;
    let active = true;

    const tick = () => {
      if (!active) return;
      const path = pathRef.current;
      const pathLen = pathLengthRef.current;
      if (path && pathLen > 0 && geom.total > 0) {
        const now = Date.now();
        let pitCount = 0;
        const pitTotalSlot = Math.max(1, countPitlike(entryRef.current));
        for (const [stnr, handles] of dotsRef.current) {
          const entry = entryRef.current.get(stnr);
          if (!entry) {
            handles.group.style.display = "none";
            continue;
          }
          const pos = estimateCarPosition(entry, geom, now);
          renderDot(pos, handles, {
            path,
            pathLen,
            total: geom.total,
            pitIndex: pitCount,
            pitTotal: pitTotalSlot,
          });
          if (pos.kind === "in-pit" || pos.kind === "approach-pit") pitCount++;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [geom]);

  // Selection state for the info card — clicking a dot pins it open.
  const [selectedStnr, setSelectedStnr] = useState<string | null>(null);
  const selectedEntry = selectedStnr
    ? carRows.find((e) => e.STNR === selectedStnr) ?? null
    : null;
  const onToggle = useCallback(
    (stnr: string) => setSelectedStnr((cur) => (cur === stnr ? null : stnr)),
    [],
  );
  const onClose = useCallback(() => setSelectedStnr(null), []);

  return (
    <div className="relative flex-1 overflow-hidden bg-zinc-950 p-4">
      <svg
        viewBox={`0 0 ${NURBURGRING_VIEWBOX.width} ${NURBURGRING_VIEWBOX.height}`}
        className="h-full w-full"
      >
        {/* Pit lane strip */}
        <rect
          x={PIT_LANE_X}
          y={PIT_LANE_Y - 8}
          width={PIT_LANE_W}
          height={16}
          fill="#1c1917"
          stroke="#52525b"
          strokeWidth={0.5}
          rx={8}
        />
        <text
          x={PIT_LANE_X - 6}
          y={PIT_LANE_Y + 3}
          fontSize={9}
          fontFamily="ui-monospace, monospace"
          fill="#a1a1aa"
          textAnchor="end"
        >
          PIT
        </text>

        {/* Track outline */}
        <path
          ref={pathRef}
          d={NURBURGRING_PATH}
          fill="none"
          stroke="#3f3f46"
          strokeWidth={14}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Active Code 60 / double-yellow zone arcs. Drawn over the outline
            but under the dashed centerline so they read as a highlight on
            the road itself. Each arc is a ~300 m band centered on the active
            marshal post; adjacent posts merge into one longer band. */}
        {zoneArcs.map((a, i) => (
          <path
            key={`arc-${i}`}
            d={NURBURGRING_PATH}
            fill="none"
            stroke={a.kind === "dblYellow" ? "#facc15" : "#f59e0b"}
            strokeOpacity={0.9}
            strokeWidth={14}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={`0 ${a.startOffset.toFixed(2)} ${a.segLen.toFixed(2)} 99999`}
          >
            <title>{a.tooltip}</title>
          </path>
        ))}

        <path
          d={NURBURGRING_PATH}
          fill="none"
          stroke="#71717a"
          strokeWidth={1.5}
          strokeDasharray="2 6"
          strokeLinejoin="round"
        />

        {/* Sector boundary ticks */}
        {sectorTicks.map((t) => (
          <g key={`tick-${t.idx}`} transform={`translate(${t.x} ${t.y})`}>
            <circle r={3} fill="#fafafa" opacity={0.6} />
            <text
              y={-8}
              fontSize={8}
              fontFamily="ui-monospace, monospace"
              fill="#a1a1aa"
              textAnchor="middle"
            >
              I{t.idx}
            </text>
          </g>
        ))}

        {/* Start/finish marker */}
        <g transform={`translate(${NURBURGRING_START.x} ${NURBURGRING_START.y})`}>
          <rect x={-9} y={-9} width={18} height={18} fill="#fafafa" />
          <rect x={-9} y={-9} width={6} height={6} fill="#18181b" />
          <rect x={-3} y={-3} width={6} height={6} fill="#18181b" />
          <rect x={3} y={-9} width={6} height={6} fill="#18181b" />
          <rect x={-9} y={3} width={6} height={6} fill="#18181b" />
          <rect x={3} y={3} width={6} height={6} fill="#18181b" />
        </g>

        {/* Cars */}
        <g>
          {carRows.map((e) => (
            <CarDot
              key={e.STNR}
              entry={e}
              onRegister={(h) => {
                if (h) dotsRef.current.set(e.STNR, h);
                else dotsRef.current.delete(e.STNR);
              }}
              onSelect={() => onToggle(e.STNR)}
              isSelected={selectedStnr === e.STNR}
            />
          ))}
        </g>
      </svg>

      {/* Legend */}
      <div className="pointer-events-none absolute left-4 top-4 rounded border border-f1-divider/60 bg-zinc-900/80 px-3 py-2 text-[10px] uppercase tracking-wider text-f1-dim">
        <div className="font-bold text-zinc-200">{snapshot.TRACKNAME}</div>
        <div>
          {(geom.total / 1000).toFixed(3)} km · {geom.sectorLengths.length} sectors
        </div>
        <div className="mt-1 normal-case text-[9px]">
          Positions estimated between intermediates · dots glide forward in real time
        </div>
        {sectorSummary.length > 0 ? (
          <div className="pointer-events-auto mt-1.5 flex flex-wrap gap-1 normal-case">
            {sectorSummary.map((s) => (
              <span
                key={`leg-${s.sectorIndex}`}
                title={s.tooltip}
                className={`rounded-sm px-1.5 py-0.5 text-[9px] font-bold ${
                  s.code60Count > 0
                    ? "bg-amber-500/30 text-amber-200"
                    : "bg-yellow-400/25 text-yellow-200"
                }`}
              >
                S{s.sectorIndex + 1} {s.code60Count > 0 ? `C60 ×${s.code60Count}` : ""}
                {s.code60Count > 0 && s.dblYellowCount > 0 ? " · " : ""}
                {s.dblYellowCount > 0 ? `120 ×${s.dblYellowCount}` : ""}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Selected car card */}
      {selectedEntry ? (
        <SelectedInfo
          entry={selectedEntry}
          onClose={onClose}
          allEntries={snapshot.RESULT}
        />
      ) : null}
    </div>
  );
}

function CarDot(props: {
  entry: LtsResultEntry;
  onRegister: (h: DotHandles | null) => void;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const { entry, onRegister, onSelect, isSelected } = props;
  const groupRef = useRef<SVGGElement | null>(null);
  const circleRef = useRef<SVGCircleElement | null>(null);
  const labelRef = useRef<SVGTextElement | null>(null);

  useEffect(() => {
    if (groupRef.current && circleRef.current && labelRef.current) {
      onRegister({
        group: groupRef.current,
        circle: circleRef.current,
        label: labelRef.current,
      });
    }
    return () => onRegister(null);
    // We only want to register/unregister when the component mounts/unmounts;
    // onRegister is recreated each render but the identity is harmless here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const color = classColor(entry.CLASSNAME);
  const r = isSelected ? DOT_RADIUS + 2 : DOT_RADIUS;

  return (
    <g
      ref={groupRef}
      style={{ transition: "transform 350ms linear", cursor: "pointer" }}
      onClick={onSelect}
    >
      <circle
        ref={circleRef}
        r={r}
        fill={color}
        stroke={isSelected ? "#ffffff" : "#0a0a0a"}
        strokeWidth={isSelected ? 1.5 : 1}
      />
      <text
        ref={labelRef}
        y={3.2}
        fontSize={9}
        fontWeight={700}
        fontFamily="ui-monospace, monospace"
        fill="#000"
        textAnchor="middle"
        style={{ pointerEvents: "none" }}
      >
        {entry.STNR}
      </text>
    </g>
  );
}

function countPitlike(map: Map<string, LtsResultEntry>): number {
  let n = 0;
  for (const e of map.values()) {
    const lin = Number.parseInt(e.LASTINTERMEDIATENUMBER ?? "", 10);
    if (lin === 20 || lin === 16) n++;
    else if (lin === 0) {
      const laps = Number.parseInt(e.LAPS ?? "", 10);
      if (Number.isFinite(laps) && laps > 0) n++;
    }
  }
  return n;
}

function renderDot(
  pos: CarPosState,
  handles: DotHandles,
  ctx: {
    path: SVGPathElement;
    pathLen: number;
    total: number;
    pitIndex: number;
    pitTotal: number;
  },
): void {
  const { group } = handles;
  if (pos.kind === "off-track") {
    group.style.display = "none";
    return;
  }
  group.style.display = "";

  if (pos.kind === "in-pit" || pos.kind === "approach-pit") {
    const slotW = PIT_LANE_W / Math.max(1, ctx.pitTotal);
    const x = PIT_LANE_X + slotW * ctx.pitIndex + slotW / 2;
    const y = PIT_LANE_Y;
    group.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    group.style.opacity = pos.kind === "in-pit" ? "0.6" : "0.85";
    return;
  }

  // running
  group.style.opacity = "1";
  const frac = ((pos.distance % ctx.total) + ctx.total) % ctx.total / ctx.total;
  const p = ctx.path.getPointAtLength(frac * ctx.pathLen);
  group.setAttribute("transform", `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
}

function SelectedInfo({
  entry,
  onClose,
  allEntries,
}: {
  entry: LtsResultEntry;
  onClose: () => void;
  allEntries: LtsResultEntry[];
}) {
  const pos = Number.parseInt(entry.POSITION, 10);
  const carAhead = Number.isFinite(pos) && pos > 1
    ? allEntries.find((e) => Number.parseInt(e.POSITION, 10) === pos - 1) ?? null
    : null;
  const carBehind = Number.isFinite(pos)
    ? allEntries.find((e) => Number.parseInt(e.POSITION, 10) === pos + 1) ?? null
    : null;
  const aheadLabel = carAhead ? `Ahead (#${carAhead.STNR})` : "Ahead";
  const behindLabel = carBehind ? `Behind (#${carBehind.STNR})` : "Behind";
  const timeAhead = carAhead ? signedGap(entry.INT, "-") : "—";
  const timeBehind = carBehind ? signedGap(carBehind.INT, "+") : "—";
  return (
    <div className="absolute right-4 top-4 min-w-[18rem] rounded border border-f1-divider/80 bg-zinc-900/95 p-3 pr-9 text-xs shadow-xl">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close car details"
        className="absolute right-2 top-2 rounded-sm border border-zinc-700 px-1.5 text-[11px] leading-tight text-f1-dim hover:border-zinc-500 hover:text-white"
      >
        ✕
      </button>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-f1-dim">
            #{entry.STNR} · P{entry.POSITION}
          </div>
          <div className="text-sm font-semibold text-white">
            {formatDriverName(entry.NAME)}
          </div>
        </div>
        <span
          className="rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase"
          style={{
            backgroundColor: classColor(entry.CLASSNAME),
            color: "#0a0a0a",
          }}
        >
          {entry.CLASSNAME}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-zinc-300">{entry.CAR}</div>
      {entry.TEAM ? (
        <div className="text-[11px] text-f1-dim">{entry.TEAM}</div>
      ) : null}
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
        <Field label="Lap" value={entry.LAPS} />
        <Field label="Last" value={fmtTime(entry.LASTLAPTIME)} />
        <Field label="Best" value={fmtTime(entry.FASTESTLAP)} />
        <Field label="Gap" value={fmtGap(entry.GAP)} />
        <Field label={aheadLabel} value={timeAhead} valueClassName="text-red-400" />
        <Field label={behindLabel} value={timeBehind} valueClassName="text-emerald-400" />
        <Field label="Pit#" value={entry.PITSTOPCOUNT} />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string | undefined;
  valueClassName?: string;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-f1-dim">{label}</span>
      <span className={valueClassName ?? "text-zinc-200"}>{value || "—"}</span>
    </div>
  );
}

interface SectorSummary {
  sectorIndex: number;
  code60Count: number;
  dblYellowCount: number;
  /** Hover-tooltip text listing the active marshal-post numbers. */
  tooltip: string;
}

interface ZoneArc {
  /** SVG-path-units offset to the start of this arc along the track path. */
  startOffset: number;
  /** SVG-path-units length of this arc segment. */
  segLen: number;
  /** Visual classification — picks the stroke colour. */
  kind: "code60" | "dblYellow" | "mixed";
  /** Hover-tooltip text listing the marshal posts contained in this arc. */
  tooltip: string;
}

/** Per-post half-width of the rendered band. A 150 m halfwidth → 300 m total
 *  band, comfortably wider than the typical marshal-post spacing on the
 *  Nordschleife so adjacent flagged posts merge cleanly into one arc. */
const ARC_HALF_WIDTH_M = 150;

/** Bucket each active zone into one of the LTS sectors, for the legend chip
 *  summary at the top of the track map. */
function summarizeZonesBySector(
  active: ActiveZone[],
  geom: TrackGeometry,
): SectorSummary[] {
  if (!active.length || geom.total <= 0) return [];

  type Bucket = { code60: MarshalPost[]; dblYellow: MarshalPost[] };
  const buckets = new Map<number, Bucket>();

  for (const zone of active) {
    const post = getMarshalPost(zone.ruleId);
    if (!post) continue;
    const trackDist = (post.cumLapM / MARSHAL_LAP_TOTAL_M) * geom.total;
    let sectorIndex = geom.cumulative.length - 2;
    for (let i = 0; i < geom.cumulative.length - 1; i++) {
      if (trackDist < geom.cumulative[i + 1]) {
        sectorIndex = i;
        break;
      }
    }
    let b = buckets.get(sectorIndex);
    if (!b) {
      b = { code60: [], dblYellow: [] };
      buckets.set(sectorIndex, b);
    }
    (zone.zonetype === 60 ? b.code60 : b.dblYellow).push(post);
  }

  const out: SectorSummary[] = [];
  for (const [sectorIndex, b] of buckets) {
    const parts: string[] = [];
    if (b.code60.length) {
      parts.push(`C60 at post ${b.code60.map((p) => p.name).join(", ")}`);
    }
    if (b.dblYellow.length) {
      parts.push(`Double-yellow at post ${b.dblYellow.map((p) => p.name).join(", ")}`);
    }
    out.push({
      sectorIndex,
      code60Count: b.code60.length,
      dblYellowCount: b.dblYellow.length,
      tooltip: `Sector ${sectorIndex + 1} — ${parts.join(" · ")}`,
    });
  }
  out.sort((a, b) => a.sectorIndex - b.sectorIndex);
  return out;
}

/** Build the per-post SVG arcs. Each active zone produces a band of
 *  ±ARC_HALF_WIDTH_M centred on its marshal post; overlapping bands (i.e.
 *  adjacent flagged posts) merge into one. Bands that wrap past start/finish
 *  are split so we get two arcs on either side of the line. */
function buildZoneArcs(
  active: ActiveZone[],
  geom: TrackGeometry,
  pathLen: number,
): ZoneArc[] {
  if (!active.length || geom.total <= 0 || pathLen <= 0) return [];

  const scale = geom.total / MARSHAL_LAP_TOTAL_M;
  const total = geom.total;

  interface Band {
    start: number;
    end: number;
    types: Set<60 | 120>;
    posts: string[];
  }
  const raw: Band[] = [];
  for (const zone of active) {
    const post = getMarshalPost(zone.ruleId);
    if (!post) continue;
    const center = post.cumLapM * scale;
    raw.push({
      start: center - ARC_HALF_WIDTH_M,
      end: center + ARC_HALF_WIDTH_M,
      types: new Set([zone.zonetype]),
      posts: [post.name],
    });
  }
  if (!raw.length) return [];

  raw.sort((a, b) => a.start - b.start);
  const merged: Band[] = [];
  for (const b of raw) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) {
      last.end = Math.max(last.end, b.end);
      last.posts.push(...b.posts);
      for (const t of b.types) last.types.add(t);
    } else {
      merged.push({ start: b.start, end: b.end, types: new Set(b.types), posts: [...b.posts] });
    }
  }

  const arcs: ZoneArc[] = [];
  for (const b of merged) {
    const hasC60 = b.types.has(60);
    const hasDY = b.types.has(120);
    const kind: ZoneArc["kind"] = hasC60 && hasDY ? "mixed" : hasC60 ? "code60" : "dblYellow";
    const labelParts: string[] = [];
    if (hasC60) labelParts.push("Code 60");
    if (hasDY) labelParts.push("Double-yellow");
    const tooltip = `${labelParts.join(" + ")} — post ${b.posts.join(", ")}`;

    // Shift negative starts forward by one lap so the band sits in [0, 2·total).
    let s = b.start;
    let e = b.end;
    while (s < 0) { s += total; e += total; }
    if (e <= total) {
      arcs.push(makeArc(s, e, kind, tooltip, pathLen, total));
    } else {
      // Split the wrap across start/finish.
      arcs.push(makeArc(s, total, kind, tooltip, pathLen, total));
      arcs.push(makeArc(0, e - total, kind, tooltip, pathLen, total));
    }
  }
  return arcs;
}

function makeArc(
  startM: number,
  endM: number,
  kind: ZoneArc["kind"],
  tooltip: string,
  pathLen: number,
  total: number,
): ZoneArc {
  return {
    startOffset: (startM / total) * pathLen,
    segLen: Math.max(0, ((endM - startM) / total) * pathLen),
    kind,
    tooltip,
  };
}

function signedGap(raw: string | undefined, sign: "+" | "-"): string {
  if (!raw) return "—";
  let body = raw.startsWith("+") || raw.startsWith("-") ? raw.slice(1) : raw;
  body = body.trim();
  if (!body) return "—";
  // Accept time-like values ("1.234", "1:23.456") or lap-based ("1 LAP", "+LAP 1").
  // Anything else (e.g. status codes like "R001", "----LAP 28") becomes "—".
  if (!/^\d/.test(body) && !/^LAP/i.test(body)) return "—";
  return sign + body;
}
