import type { LtsSnapshot, LtsSessionState } from "../types";
import { trackStateLabel, timeStateLabel } from "../lib/format";
import type { ConnectionStatus } from "../lib/ws-client";

export type HeaderView = "timing" | "track" | "lapchart";

export function Header(props: {
  snapshot: LtsSnapshot | null;
  session: LtsSessionState | null;
  status: ConnectionStatus;
  carsShown: number;
  carsTotal: number;
  rcOpen: boolean;
  rcUnread: number;
  onToggleRc: () => void;
  view: HeaderView;
  onSetView: (v: HeaderView) => void;
}) {
  const {
    snapshot,
    session,
    status,
    carsShown,
    carsTotal,
    rcOpen,
    rcUnread,
    onToggleRc,
    view,
    onSetView,
  } = props;
  const trackState = trackStateLabel(session?.TRACKSTATE ?? snapshot?.TRACKSTATE);
  const timeState = timeStateLabel(session?.TIMESTATE);

  const toneClass: Record<string, string> = {
    green: "bg-green-500/20 text-green-300 border-green-500/40",
    yellow: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    red: "bg-red-500/30 text-red-200 border-red-500/50",
    checkered: "bg-white/10 text-white border-white/20",
    neutral: "bg-zinc-700/40 text-zinc-300 border-zinc-600",
  };

  const statusLabel = (() => {
    switch (status.kind) {
      case "idle":
        return "idle";
      case "connecting":
        return `connecting (#${status.attempt})`;
      case "open":
        return "live";
      case "closed":
        return `closed${status.code ? ` ${status.code}` : ""}`;
      case "error":
        return "error";
    }
  })();
  const statusDot =
    status.kind === "open"
      ? "bg-green-400"
      : status.kind === "connecting"
        ? "bg-yellow-300 animate-pulse"
        : status.kind === "closed" || status.kind === "error"
          ? "bg-red-500"
          : "bg-zinc-500";

  return (
    <header className="border-b border-f1-divider bg-f1-panel">
      <div className="border-t-2 border-f1-accent" />
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 md:flex-nowrap md:gap-6 md:px-6 md:py-3">
        <div className="flex items-baseline gap-2 md:gap-3">
          <span className="font-mono text-lg font-extrabold tracking-tight text-white md:text-2xl">
            FastN24
          </span>
          <span className="hidden text-xs uppercase tracking-widest text-f1-dim md:inline">
            Live Timing
          </span>
        </div>

        <div className="hidden flex-1 items-center gap-6 text-sm md:flex">
          <div className="flex flex-col">
            <span className="text-xs uppercase text-f1-dim">Event</span>
            <span className="font-medium text-white">{snapshot?.CUP ?? "—"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs uppercase text-f1-dim">Heat</span>
            <span className="font-medium text-white">{snapshot?.HEAT ?? "—"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs uppercase text-f1-dim">Track</span>
            <span className="font-medium text-white">
              {snapshot?.TRACKNAME ?? "—"}
              {snapshot?.TRACKLENGTH ? (
                <span className="ml-1 text-f1-dim">
                  ({(Number(snapshot.TRACKLENGTH) / 1000).toFixed(3)} km)
                </span>
              ) : null}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs uppercase text-f1-dim">Cars shown</span>
            <span className="font-medium text-white">
              {carsShown}
              <span className="text-f1-dim"> / {carsTotal}</span>
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5 md:gap-3">
          <div className="inline-flex overflow-hidden rounded-sm border border-zinc-700">
            <ViewTab label="Timing" active={view === "timing"} onClick={() => onSetView("timing")} />
            <ViewTab label="Track" active={view === "track"} onClick={() => onSetView("track")} />
            <ViewTab label="Lap chart" active={view === "lapchart"} onClick={() => onSetView("lapchart")} />
          </div>
          <button
            onClick={onToggleRc}
            className={`relative rounded-sm border px-2 py-1 font-mono text-xs font-bold uppercase tracking-wider transition-colors ${
              rcOpen
                ? "border-f1-accent bg-f1-accent/20 text-white"
                : "border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:border-zinc-500"
            }`}
            title="Race control messages"
            aria-label="Race control messages"
          >
            <span className="md:hidden">RC</span>
            <span className="hidden md:inline">Race control</span>
            {!rcOpen && rcUnread > 0 ? (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-f1-accent px-1 text-[10px] font-bold text-white">
                {rcUnread > 99 ? "99+" : rcUnread}
              </span>
            ) : null}
          </button>
          <span
            className={`rounded-sm border px-2 py-1 font-mono text-xs font-bold uppercase tracking-wider ${
              toneClass[trackState.tone]
            }`}
          >
            ● {trackState.label}
          </span>
          <span className="hidden rounded-sm border border-zinc-700 bg-zinc-800/60 px-2 py-1 font-mono text-xs uppercase tracking-wider text-zinc-300 md:inline">
            {timeState}
          </span>
          <span
            className="flex items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-800/60 px-2 py-1 font-mono text-xs uppercase tracking-wider text-zinc-300"
            title={statusLabel}
          >
            <span className={`h-2 w-2 rounded-full ${statusDot}`} />
            <span className="hidden md:inline">{statusLabel}</span>
          </span>
        </div>
      </div>
    </header>
  );
}

function ViewTab(props: { label: string; active: boolean; onClick: () => void }) {
  const { label, active, onClick } = props;
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors md:px-2.5 md:text-xs ${
        active
          ? "bg-f1-accent/20 text-white"
          : "bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60"
      }`}
    >
      {label}
    </button>
  );
}
