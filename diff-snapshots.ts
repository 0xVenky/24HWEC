// Programmatic diff of A (WS PID=0) vs B (upstream DOM) vs C (dashboard DOM).
// Operates on the JSON written by snapshot-compare.ts. Prints findings.

import * as fs from "node:fs";
import * as path from "node:path";

const argPath = process.argv[2] ?? "./compare-snapshot.json";
const data = JSON.parse(fs.readFileSync(path.resolve(argPath), "utf8")) as Snapshot;

// ---------------------------------------------------------------------------
// Types

type SnapshotEntry = Record<string, string | undefined>;
interface Snapshot {
  meta: Record<string, unknown>;
  A: { RESULT: SnapshotEntry[]; NROFINTERMEDIATETIMES: string };
  B: { headers: string[]; rows: { cells: string[]; classes: string[] }[] };
  C: { headers: string[]; rows: { cells: string[]; classes: string[] }[] };
}

// ---------------------------------------------------------------------------
// Dashboard's display transforms — mirror src/lib/format.ts.

function titleCase(s: string): string {
  if (s.length === 0) return s;
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  return s;
}
function formatDriverName(raw: string | undefined): string {
  if (!raw) return "—";
  const trimmed = raw.trim();
  if (!trimmed) return "—";
  if (trimmed.includes(",")) {
    const [last, first] = trimmed.split(",").map((s) => s.trim());
    if (first && last) return `${titleCase(first)} ${titleCase(last)}`;
    return titleCase(last || first || trimmed);
  }
  if (trimmed.includes(" ")) {
    return trimmed
      .split(/\s+/)
      .map(titleCase)
      .join(" ");
  }
  return titleCase(trimmed);
}
function fmtGap(raw: string | undefined): string {
  if (!raw) return "—";
  if (raw.startsWith("+") || raw.startsWith("-")) return raw;
  if (/^\d/.test(raw)) return `+${raw}`;
  return raw;
}
function fmtTime(raw: string | undefined): string {
  if (!raw) return "—";
  return raw;
}

// ---------------------------------------------------------------------------
// Index B rows by STNR (col index 2) and C rows by STNR (col index 2).

const upstreamByStnr = new Map<string, string[]>();
for (const r of data.B.rows) {
  const stnr = r.cells[2];
  if (stnr) upstreamByStnr.set(stnr, r.cells);
}
const dashByStnr = new Map<string, string[]>();
for (const r of data.C.rows) {
  const stnr = r.cells[2];
  if (stnr) dashByStnr.set(stnr, r.cells);
}

// Top 25 by POSITION
const top = [...data.A.RESULT]
  .filter((r) => Number.isFinite(Number.parseInt(r.POSITION ?? "", 10)))
  .sort((a, b) => Number.parseInt(a.POSITION!, 10) - Number.parseInt(b.POSITION!, 10))
  .slice(0, 25);

// ---------------------------------------------------------------------------
// Field accessors per source layout.

// Upstream B cell layout (from dumped headers/classes):
//   0 positionChange, 1 position, 2 #, 3 state (lastIntermediateNumber),
//   4 className, 5 pro, 6 classRank, 7 driverName, 8 laps, 9 gap,
//   10 lastLapTime, 11 fastestLap, 12 pitStopCount, 13 vehicle,
//   14+2k sectorSpeed_(k+1), 15+2k sectorTime_(k+1)  for k in 0..8
const BIDX = {
  POSITION: 1,
  STNR: 2,
  STATE: 3,
  CLASSNAME: 4,
  PRO: 5,
  CLASSRANK: 6,
  NAME: 7,
  LAPS: 8,
  GAP: 9,
  LASTLAPTIME: 10,
  FASTESTLAP: 11,
  PITSTOPCOUNT: 12,
  CAR: 13,
  S1TIME: 15,
  S2TIME: 17,
  S3TIME: 19,
  S4TIME: 21,
  S5TIME: 23,
  S6TIME: 25,
  S7TIME: 27,
  S8TIME: 29,
  S9TIME: 31,
} as const;

// Dashboard C cell layout (from dashboard headers):
//   0 POS, 1 CLS, 2 #, 3 DRIVER/CAR, 4 LAP, 5 LAST LAP, 6 BEST,
//   7 GAP, 8 INT, 9..16 S1..S8, 17 Δ, 18 CLASS
const CIDX = {
  POSITION: 0,
  STNR: 2,
  DRIVER: 3,
  LAPS: 4,
  LASTLAPTIME: 5,
  FASTESTLAP: 6,
  GAP: 7,
  INT: 8,
  S1TIME: 9,
  S2TIME: 10,
  S3TIME: 11,
  S4TIME: 12,
  S5TIME: 13,
  S6TIME: 14,
  S7TIME: 15,
  S8TIME: 16,
  CLASSCOL: 18,
} as const;

// ---------------------------------------------------------------------------
// Diff record helper

interface Diff {
  stnr: string;
  position: string;
  side: "C-vs-A" | "B-vs-A";
  field: string;
  ws: string;
  display: string;
  assessment: string;
}
const diffs: Diff[] = [];

function pushDiff(d: Diff): void {
  diffs.push(d);
}

// ---------------------------------------------------------------------------
// Compare each top entry

for (const a of top) {
  const stnr = a.STNR!;
  const pos = a.POSITION!;
  const bRow = upstreamByStnr.get(stnr);
  const cRow = dashByStnr.get(stnr);

  if (!cRow) {
    pushDiff({
      stnr, position: pos, side: "C-vs-A", field: "ROW",
      ws: "present", display: "MISSING",
      assessment: "bug: dashboard row missing entirely",
    });
    continue;
  }

  // ---- Dashboard vs A ------------------------------------------------------

  // POSITION
  if (cRow[CIDX.POSITION] !== pos) {
    pushDiff({
      stnr, position: pos, side: "C-vs-A", field: "POSITION",
      ws: pos, display: cRow[CIDX.POSITION],
      assessment: "bug",
    });
  }
  // LAPS
  if (cRow[CIDX.LAPS] !== a.LAPS) {
    pushDiff({
      stnr, position: pos, side: "C-vs-A", field: "LAPS",
      ws: a.LAPS ?? "", display: cRow[CIDX.LAPS],
      assessment: "bug",
    });
  }
  // LASTLAPTIME — dashboard shows raw or "—". May drift if a lap completed mid-snapshot.
  {
    const expect = fmtTime(a.LASTLAPTIME);
    if (cRow[CIDX.LASTLAPTIME] !== expect) {
      pushDiff({
        stnr, position: pos, side: "C-vs-A", field: "LASTLAPTIME",
        ws: a.LASTLAPTIME ?? "", display: cRow[CIDX.LASTLAPTIME],
        assessment: "potentially drift / investigate",
      });
    }
  }
  // FASTESTLAP shown as BEST
  {
    const expect = fmtTime(a.FASTESTLAP);
    if (cRow[CIDX.FASTESTLAP] !== expect) {
      pushDiff({
        stnr, position: pos, side: "C-vs-A", field: "FASTESTLAP (BEST)",
        ws: a.FASTESTLAP ?? "", display: cRow[CIDX.FASTESTLAP],
        assessment: "bug",
      });
    }
  }
  // GAP — fmtGap transform
  {
    const expect = fmtGap(a.GAP);
    if (cRow[CIDX.GAP] !== expect) {
      pushDiff({
        stnr, position: pos, side: "C-vs-A", field: "GAP",
        ws: a.GAP ?? "", display: cRow[CIDX.GAP],
        assessment: "bug",
      });
    }
  }
  // INT — fmtGap transform
  {
    const expect = fmtGap(a.INT);
    if (cRow[CIDX.INT] !== expect) {
      pushDiff({
        stnr, position: pos, side: "C-vs-A", field: "INT",
        ws: a.INT ?? "", display: cRow[CIDX.INT],
        assessment: "bug",
      });
    }
  }
  // Sector times — S1..S8 (the dashboard truncates at S8 if NROFINTERMEDIATETIMES=8).
  for (let i = 1; i <= 8; i++) {
    const k = `S${i}TIME` as keyof typeof a;
    const ws = (a[k] as string | undefined) ?? "";
    const expect = ws === "" ? "—" : ws;
    const cellKey = `S${i}TIME` as keyof typeof CIDX;
    const got = cRow[CIDX[cellKey]];
    if (got !== expect) {
      pushDiff({
        stnr, position: pos, side: "C-vs-A", field: `S${i}TIME`,
        ws, display: got,
        assessment: "potentially drift",
      });
    }
  }
  // S9TIME — explicitly check; dashboard does NOT render this column.
  {
    const ws = (a.S9TIME as string | undefined) ?? "";
    if (ws !== "") {
      pushDiff({
        stnr, position: pos, side: "C-vs-A", field: "S9TIME",
        ws, display: "(column not rendered)",
        assessment: "bug: dashboard hides S9 due to NROFINTERMEDIATETIMES=8 even though many cars report S9 data",
      });
    }
  }
  // CLASSNAME / CLASSRANK appear concatenated in C[18] as "CLASSNAMEPCLASSRANK"
  {
    const expect = `${a.CLASSNAME ?? ""}P${a.CLASSRANK ?? ""}`;
    if (cRow[CIDX.CLASSCOL] !== expect) {
      pushDiff({
        stnr, position: pos, side: "C-vs-A", field: "CLASS column",
        ws: `${a.CLASSNAME}/P${a.CLASSRANK}`,
        display: cRow[CIDX.CLASSCOL],
        assessment: "investigate",
      });
    }
  }
  // NAME (driver). Dashboard concatenates name + PRO + car + " · " + team into one cell.
  {
    const name = formatDriverName(a.NAME);
    const car = a.CAR ?? "";
    const team = a.TEAM ?? "";
    const pro = a.PRO === "PRO" ? " PRO" : "";
    // Pit badge appears as "Pit" between name and car when LASTINTERMEDIATENUMBER==0
    const isPit = a.LASTINTERMEDIATENUMBER === "0" && a.LAPS !== "0";
    const pitBadge = isPit ? " Pit" : "";
    const expect = `${name}${pro}${pitBadge} ${car}${team ? ` · ${team}` : ""}`.trim();
    if (cRow[CIDX.DRIVER] !== expect) {
      pushDiff({
        stnr, position: pos, side: "C-vs-A", field: "DRIVER/CAR cell",
        ws: `name=${a.NAME} pro=${a.PRO ?? ""} car=${car} team=${team}`,
        display: cRow[CIDX.DRIVER],
        assessment: "investigate",
      });
    }
  }

  // ---- Upstream vs A (B-vs-A): smaller, mainly a sanity check ------------
  if (bRow) {
    if (bRow[BIDX.POSITION] !== pos) {
      pushDiff({
        stnr, position: pos, side: "B-vs-A", field: "POSITION",
        ws: pos, display: bRow[BIDX.POSITION],
        assessment: "drift",
      });
    }
    if (bRow[BIDX.LAPS] !== a.LAPS) {
      pushDiff({
        stnr, position: pos, side: "B-vs-A", field: "LAPS",
        ws: a.LAPS ?? "", display: bRow[BIDX.LAPS],
        assessment: "drift",
      });
    }
    if (bRow[BIDX.LASTLAPTIME] !== (a.LASTLAPTIME ?? "")) {
      pushDiff({
        stnr, position: pos, side: "B-vs-A", field: "LASTLAPTIME",
        ws: a.LASTLAPTIME ?? "", display: bRow[BIDX.LASTLAPTIME],
        assessment: "drift / investigate",
      });
    }
    if (bRow[BIDX.FASTESTLAP] !== (a.FASTESTLAP ?? "")) {
      pushDiff({
        stnr, position: pos, side: "B-vs-A", field: "FASTESTLAP",
        ws: a.FASTESTLAP ?? "", display: bRow[BIDX.FASTESTLAP],
        assessment: "drift / investigate",
      });
    }
    if (bRow[BIDX.GAP] !== (a.GAP ?? "")) {
      pushDiff({
        stnr, position: pos, side: "B-vs-A", field: "GAP",
        ws: a.GAP ?? "", display: bRow[BIDX.GAP],
        assessment: "drift / investigate",
      });
    }
    // Upstream NAME = surname only
    if (bRow[BIDX.NAME] !== (a.NAME ?? "")) {
      pushDiff({
        stnr, position: pos, side: "B-vs-A", field: "NAME",
        ws: a.NAME ?? "", display: bRow[BIDX.NAME],
        assessment: "investigate",
      });
    }
    // CAR
    if (bRow[BIDX.CAR] !== (a.CAR ?? "")) {
      pushDiff({
        stnr, position: pos, side: "B-vs-A", field: "CAR",
        ws: a.CAR ?? "", display: bRow[BIDX.CAR],
        assessment: "investigate",
      });
    }
    // CLASSNAME
    if (bRow[BIDX.CLASSNAME] !== (a.CLASSNAME ?? "")) {
      pushDiff({
        stnr, position: pos, side: "B-vs-A", field: "CLASSNAME",
        ws: a.CLASSNAME ?? "", display: bRow[BIDX.CLASSNAME],
        assessment: "investigate",
      });
    }
    // CLASSRANK
    if (bRow[BIDX.CLASSRANK] !== (a.CLASSRANK ?? "")) {
      pushDiff({
        stnr, position: pos, side: "B-vs-A", field: "CLASSRANK",
        ws: a.CLASSRANK ?? "", display: bRow[BIDX.CLASSRANK],
        assessment: "investigate",
      });
    }
    // S1-S9 times exact compare
    for (let i = 1; i <= 9; i++) {
      const k = `S${i}TIME` as keyof typeof a;
      const ws = (a[k] as string | undefined) ?? "";
      const bk = `S${i}TIME` as keyof typeof BIDX;
      const got = bRow[BIDX[bk]];
      if (got !== ws) {
        pushDiff({
          stnr, position: pos, side: "B-vs-A", field: `S${i}TIME`,
          ws, display: got,
          assessment: "drift / investigate",
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Print summary

console.log(`Total cars compared: ${top.length}`);
console.log(`Total diffs: ${diffs.length}`);
const bySide = diffs.reduce<Record<string, number>>((acc, d) => {
  acc[d.side] = (acc[d.side] ?? 0) + 1;
  return acc;
}, {});
console.log(`By side: ${JSON.stringify(bySide)}`);

const byField = diffs.reduce<Record<string, number>>((acc, d) => {
  acc[`${d.side}::${d.field}`] = (acc[`${d.side}::${d.field}`] ?? 0) + 1;
  return acc;
}, {});
console.log(`Per (side, field):`);
for (const [k, v] of Object.entries(byField).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

console.log("\n--- DIFF DETAIL ---");
for (const d of diffs) {
  console.log(
    `[${d.side}] P${d.position} #${d.stnr} ${d.field}: ws='${truncate(d.ws)}' display='${truncate(d.display)}' (${d.assessment})`,
  );
}

function truncate(s: string | undefined): string {
  if (s == null) return "";
  if (s.length > 60) return s.slice(0, 57) + "...";
  return s;
}
