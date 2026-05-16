import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { LtsResultEntry, LtsSnapshot } from "../types";
import { classColor } from "../lib/classes";
import {
  carStateBadge,
  classifySector,
  fmtGap,
  fmtTime,
  formatDriverName,
  interpretLin,
  parseTimeMs,
  type SectorTone,
} from "../lib/format";
import { SectorCell } from "./SectorCell";
import { HoverCard, type HoverCardAnchor } from "./HoverCard";
import { detectPitLaps } from "../lib/state";

interface BestTimes {
  overall: (number | null)[];
  personal: Map<string, (number | null)[]>;
}

function computeBestTimes(entries: LtsResultEntry[], sectorCount: number): BestTimes {
  const overall: (number | null)[] = Array(sectorCount).fill(null);
  const personal = new Map<string, (number | null)[]>();
  for (const e of entries) {
    const pb: (number | null)[] = Array(sectorCount).fill(null);
    for (let i = 0; i < sectorCount; i++) {
      const key = `S${i + 1}TIME` as keyof LtsResultEntry;
      const raw = e[key] as string | undefined;
      const ms = parseTimeMs(raw ?? "");
      if (ms == null) continue;
      pb[i] = ms;
      const cur = overall[i];
      if (cur == null || ms < cur) overall[i] = ms;
    }
    personal.set(e.STNR, pb);
  }
  return { overall, personal };
}

function rowKey(e: LtsResultEntry) {
  return e.STNR || `${e.POSITION}-${e.NAME}`;
}

function sortedByPosition(entries: LtsResultEntry[]): LtsResultEntry[] {
  return [...entries].sort((a, b) => {
    const ap = Number.parseInt(a.POSITION, 10);
    const bp = Number.parseInt(b.POSITION, 10);
    if (!Number.isFinite(ap)) return 1;
    if (!Number.isFinite(bp)) return -1;
    return ap - bp;
  });
}

function PositionChange({ chg }: { chg: string | undefined }) {
  const n = Number.parseInt(chg ?? "", 10);
  if (!Number.isFinite(n) || n === 0) {
    return <span className="font-mono text-xs text-f1-dim">—</span>;
  }
  if (n > 0) {
    return (
      <span className="font-mono text-xs text-emerald-400">↑ {Math.abs(n)}</span>
    );
  }
  return <span className="font-mono text-xs text-red-400">↓ {Math.abs(n)}</span>;
}

function msToDisplay(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return s.toFixed(3);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(3).padStart(6, "0")}`;
}

function getSectorTone(
  e: LtsResultEntry,
  i: number,
  best: BestTimes,
): SectorTone {
  const key = `S${i + 1}TIME` as keyof LtsResultEntry;
  const raw = (e[key] as string) ?? "";
  const overall = best.overall[i];
  const pbList = best.personal.get(e.STNR) ?? [];
  return classifySector(
    raw,
    overall != null ? msToDisplay(overall) : "",
    pbList[i] != null ? msToDisplay(pbList[i] as number) : "",
  );
}

function rowBg(idx: number, isLeader: boolean) {
  if (isLeader) return "bg-f1-row/80";
  return idx % 2 === 0 ? "bg-f1-row" : "bg-f1-rowAlt";
}

export function TimingTable(props: {
  snapshot: LtsSnapshot;
  filteredEntries: LtsResultEntry[];
  allEntries: LtsResultEntry[];
  lapsByCar: Map<number, import("../lib/state").LapWithDriver[]>;
}) {
  const { snapshot, filteredEntries, allEntries, lapsByCar } = props;
  const sectorCount = useMemo(() => {
    // NROFINTERMEDIATETIMES counts intermediates *between* sectors. The trailing
    // run-in to the start/finish line is one more sector, so the on-track segment
    // count is N+1. The upstream UI and the protocol (S1L..S9L) agree on 9 at
    // Nürburgring. Capped at 9 because that's how far our typed schema extends.
    const n = Number.parseInt(snapshot.NROFINTERMEDIATETIMES, 10);
    if (Number.isFinite(n) && n > 0) return Math.min(n + 1, 9);
    return 9;
  }, [snapshot.NROFINTERMEDIATETIMES]);
  const best = useMemo(
    () => computeBestTimes(filteredEntries, sectorCount),
    [filteredEntries, sectorCount],
  );
  const sorted = useMemo(() => sortedByPosition(filteredEntries), [filteredEntries]);

  const [hovered, setHovered] = useState<{
    entry: LtsResultEntry;
    anchor: HoverCardAnchor;
  } | null>(null);
  // Holds the timer that will reveal the hover card after a 1s dwell. Reset on
  // every row enter/leave so the card never appears for fly-by hovers.
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onRowEnter = useCallback(
    (entry: LtsResultEntry, el: HTMLTableRowElement | null) => {
      if (!el) return;
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = setTimeout(() => {
        // Re-measure at fire time: the row may have scrolled while waiting.
        const r = el.getBoundingClientRect();
        setHovered({
          entry,
          anchor: { top: r.top, left: r.left, height: r.height, width: r.width },
        });
        hoverTimerRef.current = null;
      }, 1000);
    },
    [],
  );
  const onRowLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHovered(null);
  }, []);
  useEffect(
    () => () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    },
    [],
  );

  return (
    <>
      <div className="timing-scroll flex-1 overflow-auto">
        <table className="min-w-full font-mono text-xs">
          <thead className="sticky top-0 z-10 bg-f1-panel">
            <tr className="border-b border-f1-divider text-f1-dim">
              <Th className="w-10 text-right">POS</Th>
              <Th className="w-8">CLS</Th>
              <Th className="w-10 text-right">#</Th>
              <Th className="min-w-[12rem]">TEAM / DRIVER</Th>
              <Th className="w-12 text-right">LAP</Th>
              <Th className="w-24 text-right">LAST LAP</Th>
              <Th className="w-24 text-right">BEST</Th>
              <Th className="w-20 text-right">GAP</Th>
              <Th className="w-20 text-right">INT</Th>
              {Array.from({ length: sectorCount }).map((_, i) => (
                <Th key={i} className="text-center">
                  S{i + 1}
                </Th>
              ))}
              <Th className="w-12 text-center">Δ</Th>
              <Th className="w-24">CLASS</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e, idx) => (
              <Row
                key={rowKey(e)}
                e={e}
                idx={idx}
                sectorCount={sectorCount}
                best={best}
                onEnter={onRowEnter}
                onLeave={onRowLeave}
              />
            ))}
          </tbody>
        </table>
      </div>
      {hovered ? (() => {
        const allLapsForCar = lapsByCar.get(Number(hovered.entry.STNR)) ?? [];
        const pitCount = Number.parseInt(hovered.entry.PITSTOPCOUNT, 10);
        return (
          <HoverCard
            entry={hovered.entry}
            allEntries={allEntries}
            anchor={hovered.anchor}
            recentLaps={allLapsForCar.slice(-5).reverse()}
            pitLaps={
              Number.isFinite(pitCount)
                ? detectPitLaps(allLapsForCar, pitCount)
                : []
            }
          />
        );
      })() : null}
    </>
  );
}

function Row(props: {
  e: LtsResultEntry;
  idx: number;
  sectorCount: number;
  best: BestTimes;
  onEnter: (e: LtsResultEntry, el: HTMLTableRowElement | null) => void;
  onLeave: () => void;
}) {
  const { e, idx, sectorCount, best, onEnter, onLeave } = props;
  const rowRef = useRef<HTMLTableRowElement>(null);

  return (
    <tr
      ref={rowRef}
      onMouseEnter={() => onEnter(e, rowRef.current)}
      onMouseLeave={onLeave}
      className={`border-b border-f1-divider/60 ${rowBg(idx, idx === 0)} transition-colors hover:bg-zinc-800/70`}
    >
      <Td className="text-right font-bold text-white">{e.POSITION}</Td>
      <Td>
        <span
          title={e.CLASSNAME}
          className="inline-block h-5 w-1.5 rounded-sm"
          style={{ backgroundColor: classColor(e.CLASSNAME) }}
        />
      </Td>
      <Td className="text-right tabular-nums text-zinc-300">{e.STNR}</Td>
      <Td>
        <DriverCell e={e} />
      </Td>
      <Td className="text-right tabular-nums text-zinc-200">{e.LAPS}</Td>
      <Td className="text-right tabular-nums text-white">{fmtTime(e.LASTLAPTIME)}</Td>
      <Td className="text-right tabular-nums text-violet-300">{fmtTime(e.FASTESTLAP)}</Td>
      <Td className="text-right tabular-nums text-zinc-200">{fmtGap(e.GAP)}</Td>
      <Td className="text-right tabular-nums text-zinc-300">{fmtGap(e.INT)}</Td>
      {Array.from({ length: sectorCount }).map((_, i) => {
        const k = `S${i + 1}TIME` as keyof LtsResultEntry;
        return (
          <Td key={i} className="text-center">
            <SectorCell
              time={(e[k] as string) ?? ""}
              tone={getSectorTone(e, i, best)}
              small
            />
          </Td>
        );
      })}
      <Td className="text-center">
        <PositionChange chg={e.CHG} />
      </Td>
      <Td>
        <span className="text-[10px] font-medium uppercase text-zinc-300">
          {e.CLASSNAME}
          <span className="ml-1 text-f1-dim">P{e.CLASSRANK}</span>
        </span>
      </Td>
    </tr>
  );
}

function DriverCell({ e }: { e: LtsResultEntry }) {
  const stateBadge = carStateBadge(interpretLin(e.LASTINTERMEDIATENUMBER, e.LAPS));
  const driver = formatDriverName(e.NAME);
  // Team is the persistent identity across stints; surface it as the headline
  // and put the current driver in the sub-line alongside the car.
  const headline = e.TEAM && e.TEAM.trim() !== "" ? e.TEAM : driver;
  const hasTeam = headline === e.TEAM;
  return (
    <div className="flex flex-col leading-tight">
      <div className="flex items-center gap-2">
        <span className="truncate font-semibold text-white">{headline}</span>
        {e.PRO ? (
          <span
            className={`rounded-sm px-1 text-[9px] font-bold uppercase tracking-wider ${proBadgeClass(e.PRO)}`}
          >
            {e.PRO}
          </span>
        ) : null}
        {stateBadge ? (
          <span
            className={`rounded-sm px-1 text-[9px] font-bold uppercase tracking-wider ${stateBadgeClass(stateBadge.tone)}`}
          >
            {stateBadge.label}
          </span>
        ) : null}
      </div>
      <span className="truncate text-[10px] text-f1-dim">
        {hasTeam ? `${driver} · ${e.CAR}` : e.CAR}
      </span>
    </div>
  );
}

function proBadgeClass(pro: string): string {
  if (pro === "PRO") return "bg-zinc-700 text-zinc-100";
  if (pro === "PROAM") return "bg-indigo-500/30 text-indigo-200";
  if (pro === "AM") return "bg-zinc-700/40 text-zinc-300";
  return "bg-zinc-700 text-zinc-100";
}

function stateBadgeClass(tone: "pit" | "approach" | "finish"): string {
  switch (tone) {
    case "pit":
      return "bg-amber-500/30 text-amber-200";
    case "approach":
      return "bg-amber-500/15 text-amber-200/80";
    case "finish":
      return "bg-emerald-500/25 text-emerald-200";
  }
}

function Th(props: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider ${props.className ?? ""}`}
    >
      {props.children}
    </th>
  );
}

function Td(props: { children: React.ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-2 py-1.5 ${props.className ?? ""}`}>{props.children}</td>;
}
