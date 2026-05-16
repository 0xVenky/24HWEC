import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { Header } from "./components/Header";
import { FilterBar, applyFilters, emptyFilters, type FilterState } from "./components/FilterBar";
import { TimingTable } from "./components/TimingTable";
import { TrackMap } from "./components/TrackMap";
import { RaceControl } from "./components/RaceControl";
import { LapChart } from "./components/LapChart";
import { LtsClient, type ConnectionStatus } from "./lib/ws-client";
import type { LtsServerMessage } from "./types";
import { initialState, reducer } from "./lib/state";
import { useCode60Zones } from "./lib/code60";

const DEFAULT_EVENT_ID = "50";
const FORCE_DESKTOP_KEY = "fastn24:forceDesktop";

function readForceDesktop(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(FORCE_DESKTOP_KEY) === "1";
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { snapshot, session, messages, lapsByCar, unreadMessages } = state;
  const [status, setStatus] = useState<ConnectionStatus>({ kind: "idle" });
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [view, setView] = useState<"timing" | "lapchart" | "track">("timing");
  const [forceDesktop, setForceDesktop] = useState<boolean>(readForceDesktop);
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    meta.setAttribute(
      "content",
      forceDesktop
        ? "width=1280, initial-scale=1"
        : "width=device-width, initial-scale=1.0",
    );
    window.localStorage.setItem(FORCE_DESKTOP_KEY, forceDesktop ? "1" : "0");
  }, [forceDesktop]);
  const [rcOpen, setRcOpen] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.innerWidth >= 1280,
  );
  const lastUpdateRef = useRef<number>(0);
  const [lastUpdateAgo, setLastUpdateAgo] = useState(0);
  const eventId = new URLSearchParams(window.location.search).get("event") ?? DEFAULT_EVENT_ID;
  const code60 = useCode60Zones(eventId);

  useEffect(() => {
    const client = new LtsClient({
      eventId,
      eventPid: [0, 3, 4, 7, 9002],
      onMessage: (msg: LtsServerMessage) => {
        lastUpdateRef.current = Date.now();
        dispatch({ type: "msg", payload: msg });
      },
      onStatus: setStatus,
    });
    client.start();
    const ticker = setInterval(() => {
      if (lastUpdateRef.current) {
        setLastUpdateAgo(Math.round((Date.now() - lastUpdateRef.current) / 1000));
      }
    }, 1000);
    return () => {
      client.stop();
      clearInterval(ticker);
    };
  }, [eventId]);

  // Acknowledge unread messages when the panel is opened.
  useEffect(() => {
    if (rcOpen && unreadMessages > 0) dispatch({ type: "ackMessages" });
  }, [rcOpen, unreadMessages]);

  const filteredEntries = useMemo(
    () => (snapshot ? applyFilters(snapshot.RESULT, filters) : []),
    [snapshot, filters],
  );

  const focusCar = useCallback((stnr: string) => {
    setFilters((f) => ({ ...f, search: stnr }));
    setRcOpen(false);
    setView("timing");
  }, []);

  const toggleRc = useCallback(() => setRcOpen((v) => !v), []);

  return (
    <>
      <div className="flex h-full flex-col">
        <Header
          snapshot={snapshot}
          session={session}
          status={status}
          carsShown={filteredEntries.length}
          carsTotal={snapshot?.RESULT.length ?? 0}
          rcOpen={rcOpen}
          rcUnread={unreadMessages}
          onToggleRc={toggleRc}
          view={view}
          onSetView={setView}
          code60={code60}
        />
        <FilterBar
          entries={snapshot?.RESULT ?? []}
          filters={filters}
          onChange={setFilters}
        />

        {!forceDesktop ? (
          <div className="flex justify-end border-b border-f1-divider bg-f1-bg px-3 py-1 md:hidden">
            <button
              type="button"
              onClick={() => setForceDesktop(true)}
              className="text-[11px] uppercase tracking-wider text-f1-dim underline-offset-2 hover:text-white hover:underline"
            >
              Desktop view →
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setForceDesktop(false)}
            className="fixed left-2 top-2 z-50 rounded-sm border border-f1-accent bg-black/80 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg backdrop-blur"
          >
            ← Mobile view
          </button>
        )}

        <div className="flex flex-1 overflow-hidden">
          <div className="flex flex-1 flex-col overflow-hidden">
            {!snapshot ? (
              <EmptyState status={status} eventId={eventId} />
            ) : view === "lapchart" ? (
              <LapChart
                snapshot={snapshot}
                filteredEntries={filteredEntries}
                lapsByCar={lapsByCar}
              />
            ) : view === "track" ? (
              <TrackMap snapshot={snapshot} filteredEntries={filteredEntries} />
            ) : filteredEntries.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-sm text-f1-dim">
                No cars match the current filters.
              </div>
            ) : (
              <TimingTable
                snapshot={snapshot}
                filteredEntries={filteredEntries}
                allEntries={snapshot.RESULT}
                lapsByCar={lapsByCar}
              />
            )}
          </div>
          {rcOpen ? (
            <RaceControl
              messages={messages}
              onSelectCar={focusCar}
              onClose={() => setRcOpen(false)}
            />
          ) : null}
        </div>

        <footer className="hidden items-center justify-between border-t border-f1-divider bg-f1-panel px-6 py-2 text-[11px] text-f1-dim md:flex">
          <span>
            Event ID <span className="font-mono text-zinc-300">{eventId}</span>
            {" · "}
            Snapshots: <span className="font-mono text-zinc-300">{snapshot ? "live" : "—"}</span>
            {" · "}
            Last update:{" "}
            <span className="font-mono text-zinc-300">
              {lastUpdateRef.current ? `${lastUpdateAgo}s ago` : "—"}
            </span>
          </span>
          <span>
            Data: <span className="font-mono">wss://livetiming.azurewebsites.net</span>{" "}
            (PID=0 · 3 · 4 · 7 · 9002)
          </span>
        </footer>
      </div>
      <Analytics />
    </>
  );
}

function EmptyState({
  status,
  eventId,
}: {
  status: ConnectionStatus;
  eventId: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="text-3xl font-extrabold tracking-tight text-zinc-200">
        Awaiting first snapshot…
      </div>
      <div className="text-sm text-f1-dim">
        Subscribed to event{" "}
        <span className="font-mono text-zinc-300">{eventId}</span>{" "}
        (PID 0 · 3 · 4 · 7 · 9002)
      </div>
      <div className="text-xs text-f1-dim">
        Connection status:{" "}
        <span className="font-mono text-zinc-300">{status.kind}</span>
        {status.kind === "connecting" ? ` (attempt ${status.attempt})` : ""}
        {status.kind === "error" ? ` — ${status.message}` : ""}
      </div>
    </div>
  );
}
