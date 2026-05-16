// Compute "distance along the track" for each car from the PID=0 snapshot,
// without GPS coords. The feed gives us per-car LASTINTERMEDIATENUMBER /
// LASTIMTIME plus sector lengths in the snapshot header; we estimate the
// current position by:
//
//   1. anchor = sum of S1L..S(LIN)L  → distance at the last intermediate the
//      car crossed.
//   2. interpolate forward across the current sector based on time-since-LIM
//      and the car's recent same-sector time. Caps at the sector boundary so
//      we never overshoot the next intermediate.
//
// Pit / approach-pit / pre-start states have no useful track position; the
// returned `state` tells callers to render them in a separate pit-lane lane.
//
// LASTINTERMEDIATENUMBER encoding (validated in COMPARE_REPORT.md against the
// upstream UI's "State" column):
//   1..9  → just passed intermediate N
//   10    → just crossed the start/finish line ("F")
//   16    → approaching pit ("AP")
//   20    → parked in pit ("PE")
//   0     → no current intermediate (pre-start or post-session)

import type { LtsResultEntry, LtsSnapshot } from "../types";
import { parseTimeMs } from "./format";

export interface TrackGeometry {
  /** Length of each sector in metres, in order S1..S9. */
  sectorLengths: number[];
  /** Cumulative distance at the end of each sector. cum[0]=0, cum[k]=Σ lens[0..k-1]. */
  cumulative: number[];
  /** Total lap length (= cum[sectorLengths.length]). */
  total: number;
}

export function trackGeometryFromSnapshot(snap: LtsSnapshot): TrackGeometry {
  const lens: number[] = [];
  for (let i = 1; i <= 9; i++) {
    const raw = (snap as unknown as Record<string, string>)[`S${i}L`];
    const n = raw ? Number.parseInt(raw, 10) : 0;
    if (Number.isFinite(n) && n > 0) lens.push(n);
  }
  const cumulative: number[] = [0];
  for (const len of lens) cumulative.push(cumulative[cumulative.length - 1] + len);
  const declared = Number.parseInt(snap.TRACKLENGTH, 10);
  const total =
    Number.isFinite(declared) && declared > 0 ? declared : cumulative[cumulative.length - 1];
  return { sectorLengths: lens, cumulative, total };
}

export type CarPosState =
  | { kind: "running"; distance: number; sectorIndex: number; confidence: "anchor" | "estimate" }
  | { kind: "approach-pit" }
  | { kind: "in-pit" }
  | { kind: "off-track" };

export function estimateCarPosition(
  entry: LtsResultEntry,
  geom: TrackGeometry,
  nowMs: number,
): CarPosState {
  const linRaw = entry.LASTINTERMEDIATENUMBER;
  const lin = linRaw ? Number.parseInt(linRaw, 10) : Number.NaN;

  if (lin === 20) return { kind: "in-pit" };
  if (lin === 16) return { kind: "approach-pit" };
  if (lin === 0) {
    const laps = Number.parseInt(entry.LAPS ?? "", 10);
    if (Number.isFinite(laps) && laps > 0) return { kind: "in-pit" };
    return { kind: "off-track" };
  }

  if (!Number.isFinite(lin)) return { kind: "off-track" };

  // anchor = cumulative distance at the last crossed intermediate. lin=10 (just
  // crossed S/F) means the car is at the start of S1, i.e. distance 0.
  let anchorIdx: number;
  if (lin === 10) anchorIdx = 0;
  else if (lin >= 1 && lin <= 9) anchorIdx = lin;
  else return { kind: "off-track" };

  // Clamp the anchor against the number of sectors we actually have (the
  // snapshot might carry fewer than 9 in some sessions).
  const maxIdx = Math.max(0, geom.cumulative.length - 1);
  if (anchorIdx > maxIdx) anchorIdx = maxIdx;

  const anchor = geom.cumulative[anchorIdx];
  // Sector the car is currently traversing (0-based). After the last
  // intermediate we wrap to sector 0 (the run from S/F to I1).
  const sectorIndex = anchorIdx >= geom.sectorLengths.length ? 0 : anchorIdx;
  const sectorLen = geom.sectorLengths[sectorIndex] ?? 0;

  const lastIm = Number.parseInt(entry.LASTIMTIME ?? "", 10);
  if (!Number.isFinite(lastIm) || sectorLen <= 0) {
    return { kind: "running", distance: anchor, sectorIndex, confidence: "anchor" };
  }

  const elapsedMs = Math.max(0, nowMs - lastIm);
  if (elapsedMs <= 0) {
    return { kind: "running", distance: anchor, sectorIndex, confidence: "anchor" };
  }

  // Estimate "how long this car normally takes through the next sector".
  const expectedMs = estimateSectorMs(entry, sectorIndex, sectorLen, geom);
  if (expectedMs == null || expectedMs <= 0) {
    return { kind: "running", distance: anchor, sectorIndex, confidence: "anchor" };
  }

  const fraction = Math.min(0.98, elapsedMs / expectedMs); // never claim we've crossed the next IM yet
  const distance = (anchor + fraction * sectorLen) % geom.total;
  return { kind: "running", distance, sectorIndex, confidence: "estimate" };
}

function estimateSectorMs(
  entry: LtsResultEntry,
  sectorIndex: number,
  sectorLen: number,
  geom: TrackGeometry,
): number | null {
  // sectorIndex is 0-based; the matching field is S${sectorIndex+1}TIME.
  const key = `S${sectorIndex + 1}TIME` as keyof LtsResultEntry;
  const raw = entry[key] as string | undefined;
  const t = parseTimeMs(raw ?? "");
  if (t != null && t > 0) return t;

  // Fallback: distribute LASTLAPTIME proportionally by sector length.
  const lap = parseTimeMs(entry.LASTLAPTIME ?? "");
  if (lap != null && lap > 0 && geom.total > 0) {
    return Math.round(lap * (sectorLen / geom.total));
  }
  return null;
}

// Smooth animation between two known distances. Used by the TrackMap to glide
// dots after each snapshot rather than teleporting. Handles wrap-around at the
// start/finish line so a dot crossing the line shows the shorter arc.
export function shortestDelta(from: number, to: number, total: number): number {
  let d = to - from;
  if (d > total / 2) d -= total;
  else if (d < -total / 2) d += total;
  return d;
}
