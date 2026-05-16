import { useMemo } from "react";
import type { LtsResultEntry } from "../types";
import { classColor } from "../lib/classes";
import { classMeta } from "../lib/classMeta";
import {
  carStateLabel,
  fmtTime,
  formatDriverName,
  interpretLin,
  parseTimeMs,
} from "../lib/format";
import { lapTotalMs, type LapWithDriver } from "../lib/state";

export interface HoverCardAnchor {
  top: number;
  left: number;
  height: number;
  width: number;
}

export function HoverCard(props: {
  entry: LtsResultEntry;
  allEntries: LtsResultEntry[]; // unfiltered, for cross-references
  anchor: HoverCardAnchor;
  recentLaps: LapWithDriver[]; // newest-first, max 5
}) {
  const { entry, allEntries, anchor, recentLaps } = props;
  const meta = classMeta(entry.CLASSNAME);

  const teammates = useMemo(
    () =>
      entry.TEAM
        ? allEntries.filter(
            (e) => e.TEAM && e.TEAM === entry.TEAM && e.STNR !== entry.STNR,
          )
        : [],
    [allEntries, entry],
  );

  const classMates = useMemo(
    () => allEntries.filter((e) => e.CLASSNAME === entry.CLASSNAME),
    [allEntries, entry.CLASSNAME],
  );

  const classFastest = useMemo(() => {
    let best: { entry: LtsResultEntry; ms: number } | null = null;
    for (const e of classMates) {
      const ms = parseTimeMs(e.FASTESTLAP);
      if (ms == null) continue;
      if (!best || ms < best.ms) best = { entry: e, ms };
    }
    return best;
  }, [classMates]);

  const classCount = classMates.length;
  const carClassRank = entry.CLASSRANK;

  // Position the card. Default: to the right of the row, vertically aligned
  // with its top. If we'd run off the right edge of the viewport, flip to the
  // left. If we'd run off the bottom, shift up.
  const CARD_WIDTH = 380;
  const CARD_MAX_HEIGHT = 640;
  const GUTTER = 12;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const wantLeft = anchor.left + anchor.width + GUTTER;
  const fitsRight = wantLeft + CARD_WIDTH <= vw - GUTTER;
  const left = fitsRight
    ? wantLeft
    : Math.max(GUTTER, anchor.left - CARD_WIDTH - GUTTER);

  let top = anchor.top;
  if (top + CARD_MAX_HEIGHT > vh - GUTTER) {
    top = Math.max(GUTTER, vh - CARD_MAX_HEIGHT - GUTTER);
  }

  return (
    <div
      role="dialog"
      style={{ top, left, width: CARD_WIDTH, maxHeight: CARD_MAX_HEIGHT }}
      className="pointer-events-none fixed z-50 overflow-hidden rounded-md border border-zinc-700 bg-f1-panel shadow-2xl ring-1 ring-black/40"
    >
      <div className="border-b border-f1-divider p-3">
        <div className="flex items-baseline gap-2">
          <span
            className="inline-block h-4 w-1.5 rounded-sm"
            style={{ backgroundColor: classColor(entry.CLASSNAME) }}
          />
          <span className="text-[10px] uppercase tracking-widest text-f1-dim">
            #{entry.STNR} · {entry.CLASSNAME}
          </span>
        </div>
        <div className="mt-1 text-lg font-bold leading-tight text-white">
          {formatDriverName(entry.NAME)}
        </div>
        <div className="text-xs text-zinc-300">
          {entry.CAR}
          {entry.TEAM ? <span className="text-f1-dim"> · {entry.TEAM}</span> : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge label={`P${entry.POSITION} overall`} tone="white" />
          <Badge
            label={`P${carClassRank} in ${entry.CLASSNAME} (of ${classCount})`}
            tone="accent"
          />
          {entry.PRO === "PRO" ? <Badge label="PRO lineup" tone="muted" /> : null}
        </div>
      </div>

      <Section title="This car">
        <KV label="Laps">{entry.LAPS}</KV>
        <KV label="Last lap">{fmtTime(entry.LASTLAPTIME)}</KV>
        <KV label="Best lap">
          <span className="text-violet-300">{fmtTime(entry.FASTESTLAP)}</span>
        </KV>
        <KV label="Gap / Int">
          <span>{entry.GAP || "—"}</span>
          <span className="text-f1-dim"> · {entry.INT || "—"}</span>
        </KV>
        <KV label="Pit stops">
          {entry.PITSTOPCOUNT}
          {entry.PITSUM ? (
            <span className="text-f1-dim"> · {entry.PITSUM}</span>
          ) : null}
        </KV>
        <KV label="Currently">
          {currentlyLabel(entry)}
        </KV>
      </Section>

      <Section title={`${entry.CLASSNAME} · ${meta.tagline}`}>
        <p className="px-3 pb-1 text-[11px] leading-snug text-zinc-300">
          {meta.description}
        </p>
        <p className="px-3 pb-2 text-[10px] italic text-f1-dim">
          Eligible cars: {meta.examples}
        </p>
        {classFastest ? (
          <div className="px-3 pb-2 text-[11px] text-zinc-300">
            Class best:{" "}
            <span className="text-violet-300">{fmtTime(classFastest.entry.FASTESTLAP)}</span>{" "}
            by #{classFastest.entry.STNR}{" "}
            <span className="text-f1-dim">
              {formatDriverName(classFastest.entry.NAME)}
            </span>
          </div>
        ) : null}
      </Section>

      {recentLaps.length > 0 ? (
        <Section title={`Recent laps (${recentLaps.length})`}>
          <RecentLaps laps={recentLaps} />
        </Section>
      ) : null}

      {teammates.length > 0 ? (
        <Section title={`Team · ${entry.TEAM} (${teammates.length + 1} entries)`}>
          <ul className="space-y-0.5 px-3 pb-3 text-[11px]">
            <li className="flex items-center gap-2">
              <span className="w-7 text-right font-mono text-f1-dim">
                #{entry.STNR}
              </span>
              <span className="text-white">[this car]</span>
              <span className="ml-auto text-f1-dim">P{entry.POSITION}</span>
            </li>
            {teammates.map((t) => (
              <li key={t.STNR} className="flex items-center gap-2">
                <span className="w-7 text-right font-mono text-f1-dim">
                  #{t.STNR}
                </span>
                <span className="truncate text-zinc-200">
                  {formatDriverName(t.NAME)}
                </span>
                <span className="text-f1-dim"> · {t.CLASSNAME}</span>
                <span className="ml-auto text-zinc-300">P{t.POSITION}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-f1-divider/70 last:border-0">
      <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-f1-dim">
        {props.title}
      </div>
      {props.children}
    </div>
  );
}

function KV(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-0.5 text-xs">
      <span className="text-f1-dim">{props.label}</span>
      <span className="font-mono tabular-nums text-zinc-100">{props.children}</span>
    </div>
  );
}

function Badge(props: { label: string; tone: "white" | "accent" | "muted" }) {
  const tone =
    props.tone === "white"
      ? "bg-zinc-800 text-zinc-100 border-zinc-700"
      : props.tone === "accent"
        ? "bg-f1-accent/20 text-red-200 border-f1-accent/50"
        : "bg-zinc-700/40 text-zinc-300 border-zinc-600";
  return (
    <span
      className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}
    >
      {props.label}
    </span>
  );
}

function currentlyLabel(e: LtsResultEntry): string {
  return carStateLabel(interpretLin(e.LASTINTERMEDIATENUMBER, e.LAPS));
}

function formatLapMs(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return s.toFixed(3);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(3).padStart(6, "0")}`;
}

function RecentLaps({ laps }: { laps: LapWithDriver[] }) {
  // PB/OB are scoped to *this car* across the laps shown.
  const totals = laps.map(lapTotalMs);
  const bestThisCar = useMemo(() => {
    let best: number | null = null;
    for (const t of totals) {
      if (t == null) continue;
      if (best == null || t < best) best = t;
    }
    return best;
  }, [totals]);

  return (
    <div className="px-3 pb-2">
      <table className="w-full font-mono text-[10px] tabular-nums">
        <thead>
          <tr className="text-f1-dim">
            <th className="w-8 text-right">L</th>
            <th className="w-16 text-right">Total</th>
            <th className="text-center">S1–S9</th>
            <th className="text-left">Driver</th>
          </tr>
        </thead>
        <tbody>
          {laps.map((l, i) => {
            const total = totals[i];
            const isBest = total != null && total === bestThisCar;
            return (
              <tr key={`${l.N}-${l.L}`} className="border-t border-f1-divider/60">
                <td className="text-right text-zinc-300">{l.L}</td>
                <td
                  className={`text-right ${
                    isBest ? "text-violet-300" : total != null ? "text-white" : "text-f1-dim"
                  }`}
                >
                  {total != null ? formatLapMs(total) : "—"}
                </td>
                <td className="px-1">
                  <div className="flex flex-wrap gap-0.5">
                    {l.sectors.map((s, idx) => {
                      const tone = sectorToneInRecent(s, idx, laps);
                      return (
                        <span
                          key={idx}
                          className={`inline-block min-w-[2rem] rounded-sm px-1 text-[9px] ${tone}`}
                          title={`S${idx + 1}${l.speeds[idx] ? ` · ${l.speeds[idx]} km/h` : ""}`}
                        >
                          {s && s !== "00.000" ? s : "—"}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="truncate text-zinc-200" title={l.driverName}>
                  {l.driverName === "?" ? (
                    <span className="italic text-f1-dim" title="Backfilled lap — driver unknown">
                      backfill
                    </span>
                  ) : (
                    formatDriverName(l.driverName) || "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function sectorToneInRecent(
  raw: string,
  idx: number,
  laps: LapWithDriver[],
): string {
  if (!raw || raw === "00.000") return "bg-zinc-800/40 text-f1-dim";
  const me = parseTimeMs(raw);
  if (me == null) return "bg-zinc-800/40 text-zinc-300";
  let best: number | null = null;
  for (const l of laps) {
    const t = parseTimeMs(l.sectors[idx] ?? "");
    if (t == null || (l.sectors[idx] ?? "") === "00.000") continue;
    if (best == null || t < best) best = t;
  }
  if (best != null && me === best) return "bg-violet-500/25 text-violet-200";
  return "bg-zinc-800/60 text-zinc-200";
}
