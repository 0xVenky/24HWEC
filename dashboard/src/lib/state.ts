import type {
  LtsCarLapHistory,
  LtsClassBest,
  LtsLap,
  LtsRaceControl,
  LtsRaceControlMessage,
  LtsServerMessage,
  LtsSessionState,
  LtsSnapshot,
  LtsStats,
} from "../types";
import { parseTimeMs } from "./format";

export interface LapWithDriver {
  L: number;
  N: number;
  D: number;
  T: string;
  sectors: string[]; // S1..S9
  speeds: number[]; // V1..V9
  driverName: string; // "?" for backfilled laps where current driver isn't known
  classAtTime: string;
}

export interface AppState {
  snapshot: LtsSnapshot | null;
  session: LtsSessionState | null;
  raceControl: LtsRaceControl | null; // last full frame, for header fields
  messages: Map<string, LtsRaceControlMessage>; // de-duped by ID
  lapsByCar: Map<number, LapWithDriver[]>;
  classProgression: LtsClassBest[];
  stats: LtsStats | null;
  unreadMessages: number; // bumps when new IDs arrive, reset by the UI
}

export const initialState: AppState = {
  snapshot: null,
  session: null,
  raceControl: null,
  messages: new Map(),
  lapsByCar: new Map(),
  classProgression: [],
  stats: null,
  unreadMessages: 0,
};

export type Action =
  | { type: "msg"; payload: LtsServerMessage }
  | { type: "ackMessages" }; // user opened the race-control panel

function lookupDriver(snapshot: LtsSnapshot | null, carNo: number) {
  if (!snapshot) return { driverName: "", classAtTime: "" };
  for (const r of snapshot.RESULT) {
    if (Number(r.STNR) === carNo) {
      return { driverName: r.NAME, classAtTime: r.CLASSNAME };
    }
  }
  return { driverName: "", classAtTime: "" };
}

function lapToWithDriver(d: LtsLap, driverName: string, classAtTime: string): LapWithDriver {
  return {
    L: d.L,
    N: d.N,
    D: d.D,
    T: d.T,
    sectors: [d.S1, d.S2, d.S3, d.S4, d.S5, d.S6, d.S7, d.S8, d.S9],
    speeds: [d.V1, d.V2, d.V3, d.V4, d.V5, d.V6, d.V7, d.V8, d.V9],
    driverName,
    classAtTime,
  };
}

// PID=7 TYPE=0 carries the car's complete cumulative lap history (sorted by L),
// not an incremental event. Replace the car's lap list whenever a frame arrives.
//
// Driver-attribution rules:
//  - First time we see a car (state had no prior list): every lap is treated as
//    backfill — driverName "?". We can't attribute retroactively because the
//    feed only carries the *current* driver.
//  - Subsequent frames: laps with L ≤ previous max retain their prior driver
//    attribution. Laps with L > previous max are "new" — resolve the current
//    PID=0 NAME for that car number.
function reduceLapHistory(
  state: AppState,
  ev: LtsCarLapHistory,
): Map<number, LapWithDriver[]> {
  if (!ev.DATA || ev.DATA.length === 0) return state.lapsByCar;
  const N = ev.N;
  const prevList = state.lapsByCar.get(N);
  const prevByLap = new Map<number, LapWithDriver>();
  let prevMax = 0;
  if (prevList) {
    for (const p of prevList) {
      prevByLap.set(p.L, p);
      if (p.L > prevMax) prevMax = p.L;
    }
  }
  const isFirstFrame = prevList === undefined;
  const current = lookupDriver(state.snapshot, N);
  const out: LapWithDriver[] = [];
  for (const d of ev.DATA) {
    if (isFirstFrame) {
      // Backfill: driver unknown.
      out.push(lapToWithDriver(d, "?", ""));
      continue;
    }
    if (d.L <= prevMax) {
      const prior = prevByLap.get(d.L);
      if (prior) {
        // Preserve driver attribution; refresh timing fields in case the
        // server has finalized any preliminary values.
        out.push({
          ...lapToWithDriver(d, prior.driverName, prior.classAtTime),
        });
      } else {
        // Server emitted a gap-filled older lap we didn't have. Treat as backfill.
        out.push(lapToWithDriver(d, "?", ""));
      }
    } else {
      // New lap — attribute to current driver.
      out.push(lapToWithDriver(d, current.driverName, current.classAtTime));
    }
  }
  out.sort((a, b) => a.L - b.L);
  const next = new Map(state.lapsByCar);
  next.set(N, out);
  return next;
}

function mergeMessages(
  current: Map<string, LtsRaceControlMessage>,
  incoming: LtsRaceControlMessage[],
): { merged: Map<string, LtsRaceControlMessage>; newCount: number } {
  let newCount = 0;
  const merged = new Map(current);
  for (const m of incoming) {
    if (!merged.has(m.ID)) {
      newCount++;
      merged.set(m.ID, m);
    }
  }
  return { merged, newCount };
}

export function reducer(state: AppState, action: Action): AppState {
  if (action.type === "ackMessages") {
    if (state.unreadMessages === 0) return state;
    return { ...state, unreadMessages: 0 };
  }
  const msg = action.payload;
  // Discriminate. PID is a string in this protocol.
  const m = msg as { PID?: unknown; TYPE?: unknown };
  if (m.PID === "0") {
    return { ...state, snapshot: msg as LtsSnapshot };
  }
  if (m.PID === "4") {
    return { ...state, session: msg as LtsSessionState };
  }
  if (m.PID === "3") {
    const rc = msg as LtsRaceControl;
    const { merged, newCount } = mergeMessages(state.messages, rc.MESSAGES ?? []);
    return {
      ...state,
      raceControl: rc,
      messages: merged,
      // First frame after subscribe carries the cumulative history — don't
      // count those as "new". The simplest heuristic: ignore the bump when
      // there was no prior raceControl frame.
      unreadMessages:
        state.raceControl === null
          ? state.unreadMessages
          : state.unreadMessages + newCount,
    };
  }
  if (m.PID === "7" && m.TYPE === 0) {
    const ev = msg as LtsCarLapHistory;
    return { ...state, lapsByCar: reduceLapHistory(state, ev) };
  }
  if (m.PID === "7" && m.TYPE === 1) {
    const cp = (msg as { DATA?: LtsClassBest[] }).DATA;
    if (Array.isArray(cp) && state.classProgression.length === 0) {
      return { ...state, classProgression: cp };
    }
    return state;
  }
  if (m.PID === "9002") {
    return { ...state, stats: msg as LtsStats };
  }
  return state;
}

export function tone(messageText: string): "red" | "amber" | "green" | "neutral" {
  const s = messageText.toLowerCase();
  if (/red flag|stop and go|disqualif/.test(s)) return "red";
  if (/investigation|code 60|technical flag|penalty/.test(s)) return "amber";
  if (/no further action|cleared/.test(s)) return "green";
  return "neutral";
}

// Compute total lap time in ms. Prefer the server's authoritative `T` field
// when present and non-zero (see PROTOCOL.md for T semantics — live-stream
// form: T = D(L) − D(L−1); backfill form: T = session-elapsed since L=1).
// Falls back to Σ(S1..S9) when T is the "00.000" placeholder.
export function lapTotalMs(lap: LapWithDriver): number | null {
  // Σ(S1..S9) is always the actual lap duration; use it preferentially.
  let total = 0;
  let anyValid = false;
  for (const s of lap.sectors) {
    if (!s || s === "00.000") continue;
    const ms = parseTimeMs(s);
    if (ms == null) continue;
    total += ms;
    anyValid = true;
  }
  if (anyValid) return total;
  // Last resort: parse T. Note T may be elapsed-since-session-start in the
  // backfill form, not a lap duration — only use this when there are no sectors.
  if (lap.T && lap.T !== "00.000") {
    const ms = parseTimeMs(lap.T);
    if (ms != null && ms > 0) return ms;
  }
  return null;
}
