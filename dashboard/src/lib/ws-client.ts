import type { LtsServerMessage } from "../types";

// In dev, route through Vite's WS proxy at /lts-ws so Origin is rewritten.
// In a non-Vite host you can override via VITE_LTS_WS_URL.
function defaultWsUrl(): string {
  const override = import.meta.env.VITE_LTS_WS_URL as string | undefined;
  if (override) return override;
  if (import.meta.env.DEV) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/lts-ws/`;
  }
  return "wss://livetiming.azurewebsites.net/";
}

export type ConnectionStatus =
  | { kind: "idle" }
  | { kind: "connecting"; attempt: number }
  | { kind: "open" }
  | { kind: "closed"; code?: number; reason?: string }
  | { kind: "error"; message: string };

export interface LtsClientOptions {
  eventId: string;
  eventPid?: number[];
  url?: string;
  onMessage: (msg: LtsServerMessage) => void;
  onStatus?: (s: ConnectionStatus) => void;
}

export class LtsClient {
  private ws: WebSocket | null = null;
  private opts: LtsClientOptions;
  private url: string;
  private reconnectDelayMs = 1000;
  private maxReconnectDelayMs = 15_000;
  private attempt = 0;
  private stopped = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: LtsClientOptions) {
    this.opts = opts;
    this.url = opts.url ?? defaultWsUrl();
  }

  start(): void {
    this.stopped = false;
    this.attempt = 0;
    this.reconnectDelayMs = 1000;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  private connect(): void {
    if (this.stopped) return;
    this.attempt++;
    this.opts.onStatus?.({ kind: "connecting", attempt: this.attempt });
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this.opts.onStatus?.({ kind: "error", message: (err as Error).message });
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.opts.onStatus?.({ kind: "open" });
      this.reconnectDelayMs = 1000;
      this.subscribe();
      // Keep the pipe warm with a periodic time-sync request mirroring the
      // observed client→server frame.
      this.pingTimer = setInterval(() => this.subscribe(), 15_000);
    });

    ws.addEventListener("message", (e) => {
      let msg: LtsServerMessage | null = null;
      try {
        msg = JSON.parse(typeof e.data === "string" ? e.data : "") as LtsServerMessage;
      } catch {
        return;
      }
      if (msg) this.opts.onMessage(msg);
    });

    ws.addEventListener("close", (e) => {
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      this.opts.onStatus?.({ kind: "closed", code: e.code, reason: e.reason });
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      this.opts.onStatus?.({ kind: "error", message: "WebSocket error" });
      // 'close' will follow; reconnect is scheduled there.
    });
  }

  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const payload = {
      eventId: this.opts.eventId,
      eventPid: this.opts.eventPid ?? [0, 3, 4, 7, 9002],
      clientLocalTime: Date.now(),
    };
    try {
      this.ws.send(JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.maxReconnectDelayMs, this.reconnectDelayMs * 2);
    setTimeout(() => this.connect(), delay);
  }
}
