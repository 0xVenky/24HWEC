import type { SectorTone } from "../lib/format";

const TONE_CLASSES: Record<SectorTone, string> = {
  empty: "text-f1-dim/60",
  normal: "bg-yellow-500/15 text-yellow-300",
  pb: "bg-emerald-500/20 text-emerald-300",
  ob: "bg-violet-500/25 text-violet-200",
  pit: "bg-amber-500/20 text-amber-200 italic",
};

export function SectorCell(props: { time: string; tone: SectorTone; small?: boolean }) {
  const { time, tone, small } = props;
  const cls = TONE_CLASSES[tone];
  const display = time && time !== "" ? time : "—";
  return (
    <span
      className={`inline-block min-w-[3.5rem] rounded-sm px-1.5 ${small ? "text-[11px]" : "text-xs"} font-mono tabular-nums tracking-tight ${cls}`}
    >
      {display}
    </span>
  );
}
