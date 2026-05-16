// Code 60 zone poller for the 24h Nürburgring.
//
// The official livetiming WS exposes only the global TRACKSTATE (one int) and
// post-hoc penalty messages — no per-zone state. The GPSoverIP "racing rules"
// HTTP endpoint is the only real-time source. Discovered via Playwright
// capture of nords-gps.vercel.app, which renders its zone map off this exact
// endpoint. See code60-scout-report.md at repo root for the full investigation.
//
// Endpoint shape:
//   GET https://api-racingios.gpsoverip.de/v1/racing/rules/active?overipapp=IPADIPHADAC24H
//   → { data: [[zonetype, ruleid], ...], meta: { ... } }
//
// zonetype legend (observed):
//   60  = Code 60 active (drivers must do ≤ 60 km/h)
//   120 = double-yellow / 120 km/h cap
//   0   = cleared / unrestricted
//   -1  = inactive / removed
//
// ruleid is stable per physical zone across the race.
//
// CORS open, no auth. overipapp identifies the event:
//   IPADIPHADAC24H = 24h Nürburgring (eventId=50 in the LTS WS)
import { useEffect, useState } from "react";

const ENDPOINT =
  "https://api-racingios.gpsoverip.de/v1/racing/rules/active?overipapp=IPADIPHADAC24H";

const POLL_INTERVAL_MS = 2_000;

// Map LTS eventId → GPSoverIP overipapp. Only 24h Nürburgring is mapped today;
// other events have different upstream IDs (IPHLEMANS, IPH24HHOCK, …) but
// FastN24 only targets this race, so we gate the poller on this match.
const EVENT_TO_OVERIPAPP: Record<string, string> = {
  "50": "IPADIPHADAC24H",
};

type ZoneRow = [zonetype: number, ruleid: number];
type ZonesResponse = { data: ZoneRow[] };

export interface Code60State {
  code60: number;
  dblYellow: number;
  total: number;
  lastUpdatedMs: number;
  stale: boolean;
}

export function useCode60Zones(eventId: string): Code60State | null {
  const enabled = eventId in EVENT_TO_OVERIPAPP;
  const [state, setState] = useState<Code60State | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState(null);
      return;
    }
    let cancelled = false;
    const ac = new AbortController();

    const tick = async () => {
      try {
        const r = await fetch(`${ENDPOINT}&ts=${Date.now()}`, {
          cache: "no-store",
          signal: ac.signal,
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as ZonesResponse;
        if (cancelled) return;
        let c60 = 0;
        let c120 = 0;
        for (const [t] of j.data) {
          if (t === 60) c60++;
          else if (t === 120) c120++;
        }
        setState({
          code60: c60,
          dblYellow: c120,
          total: j.data.length,
          lastUpdatedMs: Date.now(),
          stale: false,
        });
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        // Keep last known counts but mark as stale so the UI can dim them.
        setState((prev) => (prev ? { ...prev, stale: true } : null));
      }
    };

    tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      ac.abort();
      window.clearInterval(id);
    };
  }, [enabled]);

  return state;
}
