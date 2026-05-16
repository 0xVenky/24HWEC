// 24h Nürburgring class colour map. Predefined entries cover the classes seen
// in the captured sample; any unseen class falls through to a deterministic
// hash-based colour so the bar stays stable.

const PREDEFINED: Record<string, string> = {
  "SP-PRO": "#e10600", // F1 red
  "SP 9": "#ff8000", // McLaren orange
  "SP 9 PRO": "#ff8000",
  "SP 9 PRO-AM": "#ff8000",
  "SP-X": "#a020f0", // purple
  "SP X": "#a020f0",
  "SP 10": "#f3c700", // yellow
  "SP 8": "#16c47f",
  "SP 8T": "#16c47f",
  "SP 7": "#22d3ee",
  "SP 6": "#3b82f6",
  "SP 4T": "#ec4899",
  "SP 4": "#ec4899",
  "SP 3T": "#f472b6",
  "SP 3": "#f472b6",
  "SP 2T": "#fb923c",
  "Cup 2": "#06b6d4",
  "Cup 3": "#10b981",
  "BMW M240i": "#1e88e5",
  "BMW 325i": "#1e88e5",
  BMW: "#1e88e5",
  "VT2 Hecka": "#84cc16",
  "VT2 Front": "#65a30d",
  V6: "#f59e0b",
  V5: "#eab308",
  V4: "#14b8a6",
  V3: "#0ea5e9",
  V2: "#8b5cf6",
  AT1: "#a3e635",
  AT2: "#bef264",
  TCR: "#ef4444",
};

const FALLBACK_PALETTE = [
  "#94a3b8",
  "#f87171",
  "#fb923c",
  "#fbbf24",
  "#a3e635",
  "#34d399",
  "#22d3ee",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
];

export function classColor(name: string): string {
  if (PREDEFINED[name]) return PREDEFINED[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return FALLBACK_PALETTE[Math.abs(h) % FALLBACK_PALETTE.length];
}

// Group classes for the quick-filter pills. Ordered by how big each bucket
// typically is in the 24h NBR entry list.
export const CLASS_GROUPS: { label: string; match: (name: string) => boolean }[] = [
  { label: "GT3 (SP9 family)", match: (n) => n.startsWith("SP 9") || n === "SP-PRO" },
  { label: "Cup", match: (n) => n.startsWith("Cup") },
  { label: "SP 10", match: (n) => n === "SP 10" },
  { label: "BMW", match: (n) => n.startsWith("BMW") },
  { label: "VT", match: (n) => n.startsWith("VT") },
  { label: "V-series", match: (n) => /^V\d/.test(n) },
  { label: "SP-X", match: (n) => n === "SP-X" || n === "SP X" },
  { label: "SP small (3T/4T/2T)", match: (n) => /^SP [234]T?$/.test(n) },
  { label: "SP 7/8", match: (n) => /^SP [78]T?$/.test(n) },
  { label: "AT", match: (n) => n.startsWith("AT") },
  { label: "TCR", match: (n) => n === "TCR" },
];
