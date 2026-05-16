// Lap-time / sector / gap formatting helpers.
// Inputs come as strings from the server. Empty string ⇒ "not available".

export function fmtTime(raw: string | undefined): string {
  if (!raw) return "—";
  return raw;
}

// Convert the server's single NAME field into something display-friendly.
// Observed forms in this protocol:
//   "Engel"                → "Engel"          (no first name available)
//   "Engel, Maro"          → "Maro Engel"     (some feeds use Lastname, Firstname)
//   "Maro Engel"           → "Maro Engel"     (already correct)
//   "ENGEL"                → "Engel"          (title-cased)
export function formatDriverName(raw: string | undefined): string {
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

function titleCase(s: string): string {
  if (s.length === 0) return s;
  // Preserve already-mixed-case names (e.g. "McLaren"); only adjust pure upper/lower.
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  return s;
}

export function fmtGap(raw: string | undefined): string {
  if (!raw) return "—";
  if (raw.startsWith("+") || raw.startsWith("-")) return raw;
  // Some leaders/leaders-of-class send empty; raw number => prefix with +
  if (/^\d/.test(raw)) return `+${raw}`;
  return raw;
}

export function fmtSpeed(raw: string | undefined): string {
  if (!raw || raw === "0.0" || raw === "0") return "—";
  return raw;
}

export function fmtPitSum(raw: string | undefined): string {
  if (!raw) return "—";
  // Format observed: "000123.456" — drop leading zeros but keep at least one digit
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n < 60) return `${n.toFixed(1)}s`;
  const m = Math.floor(n / 60);
  const s = n - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

// Sector colour code from ST<n>V / ST<n>T: in iRacing/HMS systems the convention is
// usually 0 = normal, 1 = personal best (green), 2 = overall best (purple/violet).
// The observed sample only contains 0; we infer best-of-segment from data instead.
export type SectorTone = "normal" | "pb" | "ob" | "empty" | "pit";

export function classifySector(
  myTime: string | undefined,
  bestOverall: string | undefined,
  bestPersonal: string | undefined,
): SectorTone {
  if (!myTime || myTime === "") return "empty";
  if (myTime === "PIT") return "pit";
  const a = parseTimeMs(myTime);
  if (a == null) return "normal";
  const ob = parseTimeMs(bestOverall ?? "");
  const pb = parseTimeMs(bestPersonal ?? "");
  if (ob != null && Math.abs(a - ob) < 1) return "ob";
  if (pb != null && Math.abs(a - pb) < 1) return "pb";
  return "normal";
}

// LASTINTERMEDIATENUMBER encoding seen in the wild:
//   1..9  → just passed intermediate N (currently running in sector N+1)
//   10    → just crossed the start/finish line
//   16    → approaching pit lane
//   20    → parked in pit / in pit lane
//   0     → no current intermediate (pre-start or post-session)
// Confirmed against the upstream UI's "State" column (I1..I9, F, AP, PE).
export type CarState =
  | { kind: "running"; sector: number }
  | { kind: "finished-lap" }
  | { kind: "approaching-pit" }
  | { kind: "in-pit" }
  | { kind: "stationary" }
  | { kind: "unknown"; raw: string };

export function interpretLin(
  raw: string | undefined,
  laps: string | undefined,
): CarState {
  if (raw == null || raw === "") return { kind: "unknown", raw: raw ?? "" };
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return { kind: "unknown", raw };
  if (n >= 1 && n <= 9) return { kind: "running", sector: n + 1 };
  if (n === 10) return { kind: "finished-lap" };
  if (n === 16) return { kind: "approaching-pit" };
  if (n === 20) return { kind: "in-pit" };
  if (n === 0) {
    const lapN = Number.parseInt(laps ?? "", 10);
    if (Number.isFinite(lapN) && lapN > 0) return { kind: "in-pit" };
    return { kind: "stationary" };
  }
  return { kind: "unknown", raw };
}

export function carStateLabel(s: CarState): string {
  switch (s.kind) {
    case "running":
      return `In sector ${s.sector}`;
    case "finished-lap":
      return "Crossed line";
    case "approaching-pit":
      return "Approaching pit";
    case "in-pit":
      return "In pit";
    case "stationary":
      return "Not on track";
    case "unknown":
      return s.raw ? `Unknown state (${s.raw})` : "Unknown";
  }
}

export interface CarStateBadge {
  label: string;
  tone: "pit" | "approach" | "finish";
}

export function carStateBadge(s: CarState): CarStateBadge | null {
  switch (s.kind) {
    case "in-pit":
      return { label: "Pit", tone: "pit" };
    case "approaching-pit":
      return { label: "AP", tone: "approach" };
    case "finished-lap":
      return { label: "Lap", tone: "finish" };
    default:
      return null;
  }
}

// Parse "44.885" or "1:16.162" or "10:09.386" → milliseconds
export function parseTimeMs(raw: string): number | null {
  if (!raw) return null;
  const parts = raw.split(":").map((p) => p.trim());
  if (parts.length === 1) {
    const n = Number.parseFloat(parts[0]);
    return Number.isFinite(n) ? Math.round(n * 1000) : null;
  }
  if (parts.length === 2) {
    const m = Number.parseInt(parts[0], 10);
    const s = Number.parseFloat(parts[1]);
    if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
    return Math.round((m * 60 + s) * 1000);
  }
  if (parts.length === 3) {
    const h = Number.parseInt(parts[0], 10);
    const m = Number.parseInt(parts[1], 10);
    const s = Number.parseFloat(parts[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null;
    return Math.round((h * 3600 + m * 60 + s) * 1000);
  }
  return null;
}

export function trackStateLabel(trackState: string | undefined): { label: string; tone: "green" | "yellow" | "red" | "checkered" | "neutral" } {
  switch (trackState) {
    case "0":
      return { label: "GREEN", tone: "green" };
    case "1":
      return { label: "YELLOW", tone: "yellow" };
    case "2":
      return { label: "RED", tone: "red" };
    case "3":
      return { label: "SAFETY CAR", tone: "yellow" };
    case "4":
      return { label: "FINISHED", tone: "checkered" };
    default:
      return { label: trackState ? `STATE ${trackState}` : "—", tone: "neutral" };
  }
}

export function timeStateLabel(timeState: string | undefined): string {
  switch (timeState) {
    case "0":
      return "WAITING";
    case "1":
      return "LIVE";
    case "2":
      return "PAUSED";
    case "3":
      return "FINISHED";
    default:
      return timeState ? `T${timeState}` : "—";
  }
}
