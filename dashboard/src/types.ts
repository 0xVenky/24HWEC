// Inferred from PROTOCOL.md. The server encodes most numeric values as strings;
// we keep them as strings here and coerce at the UI layer.

export interface LtsClientSubscribe {
  eventId: string;
  eventPid: number[];
  clientLocalTime: number;
}

export interface LtsTimeSync extends LtsClientSubscribe {
  PID: "LTS_TIMESYNC";
  serverLocalTime: number;
}

export interface LtsResultEntry {
  POSITION: string; // overall position "1".."161"
  RANK: string;
  CLASSRANK: string; // position within CLASSNAME
  CHG: string; // change indicator? "0" in our sample
  STNR: string; // start number
  ETA: string; // estimated arrival ms epoch as string
  LAPS: string;
  NAME: string; // driver surname currently in the car
  CLASSNAME: string; // e.g. "SP 9", "Cup 3"
  PRO?: string; // "PRO" / "AM"
  CAR: string;
  ISQUA: string;
  GAP: string; // gap to leader, e.g. "+1:23.456", may be empty
  INT: string; // interval to car ahead
  LASTLAPTIME: string; // e.g. "10:09.386" or ""
  LLTS: string; // last-lap status / colour code
  FASTESTLAP: string;
  FLTS: string;
  PITSTOPCOUNT: string;
  PITSUM: string; // total pit time, e.g. "000123.456"
  LASTINTERMEDIATENUMBER: string; // 0..9 indicating which sector they're currently in
  LASTIMTIME: string;
  S1TIME: string;
  ST1T: string;
  S1SPEED: string;
  ST1V: string;
  S2TIME: string;
  ST2T: string;
  S2SPEED: string;
  ST2V: string;
  S3TIME: string;
  ST3T: string;
  S3SPEED: string;
  ST3V: string;
  S4TIME: string;
  ST4T: string;
  S4SPEED: string;
  ST4V: string;
  S5TIME: string;
  ST5T: string;
  S5SPEED: string;
  ST5V: string;
  S6TIME: string;
  ST6T: string;
  S6SPEED: string;
  ST6V: string;
  S7TIME: string;
  ST7T: string;
  S7SPEED: string;
  ST7V: string;
  S8TIME: string;
  ST8T: string;
  S8SPEED: string;
  ST8V: string;
  S9TIME: string;
  ST9T?: string;
  S9SPEED: string;
  ST9V: string;
  TOPSPEED?: string;
  TEAM?: string;
  TPST?: string;
  LLT?: string;
  LLC?: string;
}

export interface LtsSnapshot {
  PID: "0";
  RECNUM: string;
  SND: string;
  RCV: string;
  VER: string | number;
  EXPORTID: string;
  HEATTYPE: string;
  SESSION: string;
  NROFINTERMEDIATETIMES: string;
  TRACKNAME: string;
  TRACKLENGTH: string;
  S1L: string;
  S2L: string;
  S3L: string;
  S4L: string;
  S5L: string;
  S6L: string;
  S7L: string;
  S8L: string;
  S9L: string;
  APL: string;
  BEST: Array<[number, string, number, string]>;
  TRACKSTATE: string;
  HEATNUMBER: string;
  CUP: string;
  HEAT: string;
  TOD: string;
  STQ: string;
  RESULT: LtsResultEntry[];
}

export interface LtsSessionState {
  PID: "4";
  RECNUM: string;
  SND: string;
  RCV: string;
  VER: string | number;
  EXPORTID: string;
  TRACKSTATE: string;
  TIMESTATE: string;
  ENDTIME: string;
  TOD: string;
}

// PID=3 — race-control / steward messages. The frame carries the cumulative
// list seen so far in the session (IDs monotonic); de-dup by ID at the UI layer
// instead of replacing the whole list each tick.
export interface LtsRaceControlMessage {
  ID: string;
  MESSAGETIME: string; // "HH:MM:SS" local-ish
  MESSAGE: string;
  MESSAGEGROUP: string;
}

export interface LtsRaceControl {
  PID: "3";
  RECNUM?: string;
  SND?: string;
  RCV?: string;
  VER?: string | number;
  EXPORTID: string;
  HEATTYPE: string;
  TRACKSTATE: string;
  HEATNUMBER: string;
  CUP: string;
  HEAT: string;
  TOD: string;
  MESSAGES: LtsRaceControlMessage[];
}

// PID=7 — lap events. Two TYPE variants with different DATA element shapes.
//
//   TYPE=1: one-shot class-best progression dump sent shortly after subscribe.
//   TYPE=0: per-car lap-completion events (the high-value stream).

export interface LtsClassBest {
  CLASS: string;
  LAPTIME: string;
  S1: string;
}

export interface LtsClassProgression {
  PID: "7";
  TYPE: 1;
  EXPORTID: string;
  HEATTYPE: string;
  SESSION: string;
  SECTORS: string; // intermediates count, e.g. "9"
  DATA: LtsClassBest[];
}

export interface LtsLap {
  L: number; // lap number
  N: number; // car start number (matches RESULT[i].STNR)
  D: number; // completion timestamp, epoch ms
  T: string; // semantics TBD — see PROTOCOL.md
  S1: string; V1: number;
  S2: string; V2: number;
  S3: string; V3: number;
  S4: string; V4: number;
  S5: string; V5: number;
  S6: string; V6: number;
  S7: string; V7: number;
  S8: string; V8: number;
  S9: string; V9: number;
}

// Per-car cumulative lap history. Each frame carries the car's full L=1..N
// record (sorted), not an incremental event. On arrival, REPLACE the car's
// lap list in state — don't append/merge.
export interface LtsCarLapHistory {
  PID: "7";
  TYPE: 0;
  EXPORTID: string;
  HEATTYPE: string;
  SECTORS: string;
  SESSION?: string;
  N: number; // car start number (also present on each DATA entry)
  DATA: LtsLap[];
}

export type LtsPid7 = LtsCarLapHistory | LtsClassProgression;

// PID=9002 — class statistics. ~188 KB initial push then incremental updates.
export interface LtsStatLeading {
  CLASS: string;
  NR: string;
  FROMLAP: string;
  LAPS: string;
  SUM: string;
}

export interface LtsStatBestLap {
  CLASS: string;
  NR: string;
  INLAP: string;
  LAPTIME: string;
  DAYTIME: string;
}

export interface LtsStatBestSectors {
  CLASS: string;
  LAPTIME: string;
  S1: string; S2: string; S3: string;
  S4: string; S5: string; S6: string;
  S7: string; S8: string; S9: string;
}

export interface LtsStats {
  PID: "9002";
  RECNUM?: string;
  SND?: string;
  RCV?: string;
  VER?: string | number;
  EXPORTID: string;
  HEATTYPE?: string;
  SESSION?: string;
  LEADING: LtsStatLeading[];
  BESTLAPS: LtsStatBestLap[];
  BESTSECTORS: LtsStatBestSectors[];
}

export type LtsServerMessage =
  | LtsTimeSync
  | LtsSnapshot
  | LtsSessionState
  | LtsRaceControl
  | LtsPid7
  | LtsStats;
