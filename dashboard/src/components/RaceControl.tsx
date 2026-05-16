import { useMemo } from "react";
import type { LtsRaceControlMessage } from "../types";
import { tone } from "../lib/state";

const TONE_CLASSES: Record<"red" | "amber" | "green" | "neutral", string> = {
  red: "border-red-500/60 bg-red-500/15 text-red-100",
  amber: "border-amber-500/60 bg-amber-500/10 text-amber-100",
  green: "border-emerald-500/60 bg-emerald-500/10 text-emerald-100",
  neutral: "border-zinc-700 bg-zinc-800/40 text-zinc-200",
};

// Parse "#NN" car-number references out of a message string and emit them as
// clickable spans. Cars in this paddock use 1–3 digit numbers; the regex is
// conservative to avoid eating odd things like "#KL" or "#1.5".
function MessageBody(props: {
  text: string;
  onSelectCar: (stnr: string) => void;
}) {
  const { text, onSelectCar } = props;
  const parts: Array<{ kind: "text" | "car"; value: string }> = [];
  const re = /#(\d{1,3})\b/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    parts.push({ kind: "car", value: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return (
    <span>
      {parts.map((p, i) =>
        p.kind === "car" ? (
          <button
            key={i}
            onClick={() => onSelectCar(p.value)}
            className="inline rounded-sm bg-zinc-700/60 px-1 font-bold text-white underline-offset-2 hover:bg-zinc-600 hover:underline"
            title={`Focus #${p.value}`}
          >
            #{p.value}
          </button>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </span>
  );
}

export function RaceControl(props: {
  messages: Map<string, LtsRaceControlMessage>;
  onSelectCar: (stnr: string) => void;
  onClose: () => void;
}) {
  const { messages, onSelectCar, onClose } = props;

  const sorted = useMemo(() => {
    const arr = [...messages.values()];
    // Newest-first. The upstream feed numbers messages so that the most
    // recently issued one has the *lowest* ID (verified against a live
    // capture: as IDs ascend the MESSAGETIME values move backward), so a
    // sort by ID ascending puts the freshest at the top. MESSAGETIME is a
    // tiebreaker for duplicate IDs (the server occasionally re-issues a
    // message under a new ID).
    arr.sort((a, b) => {
      const ai = Number.parseInt(a.ID, 10);
      const bi = Number.parseInt(b.ID, 10);
      if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
      return (b.MESSAGETIME ?? "").localeCompare(a.MESSAGETIME ?? "");
    });
    return arr;
  }, [messages]);

  return (
    <aside className="flex h-full w-[24rem] flex-none flex-col border-l border-f1-divider bg-f1-panel">
      <div className="flex items-center justify-between border-b border-f1-divider px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-white">
            Race control
          </span>
          <span className="text-[11px] text-f1-dim">{sorted.length}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-sm border border-zinc-700 px-2 py-0.5 text-[11px] uppercase text-f1-dim hover:border-zinc-500 hover:text-white"
        >
          Close
        </button>
      </div>
      {sorted.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-3 text-center text-xs text-f1-dim">
          No race-control messages yet.
        </div>
      ) : (
        <ul className="flex-1 overflow-auto px-2 py-2">
          {sorted.map((m) => {
            const t = tone(m.MESSAGE);
            return (
              <li
                key={m.ID}
                className={`mb-1.5 rounded-sm border px-2 py-1.5 text-[12px] leading-snug ${TONE_CLASSES[t]}`}
              >
                <div className="mb-0.5 flex items-baseline gap-2 text-[10px] uppercase tracking-widest opacity-80">
                  <span className="font-mono">{m.MESSAGETIME}</span>
                  {m.MESSAGEGROUP ? <span>· {m.MESSAGEGROUP}</span> : null}
                  <span className="ml-auto font-mono opacity-60">#{m.ID}</span>
                </div>
                <MessageBody text={m.MESSAGE} onSelectCar={onSelectCar} />
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
