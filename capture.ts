import { chromium, type BrowserContext, type Page } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import WebSocket from "ws";

const DEFAULT_URL = "https://livetiming.azurewebsites.net/event=50?config=w3";
const DEFAULT_PIDS = "0,3,4,7,9002";
const LTS_WS_URL = "wss://livetiming.azurewebsites.net/";
const LTS_WS_ORIGIN = "https://livetiming.azurewebsites.net";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: DEFAULT_URL },
    duration: { type: "string", default: "120" },
    out: { type: "string", default: "./frames.jsonl" },
    headed: { type: "boolean", default: false },
    pids: { type: "string", default: DEFAULT_PIDS },
  },
  strict: true,
});

const url = values.url!;
const durationSec = Number.parseInt(values.duration!, 10);
const outPath = path.resolve(values.out!);
const headed = Boolean(values.headed);

const pids = values
  .pids!.split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0)
  .map((s) => Number.parseInt(s, 10));
if (pids.length === 0 || pids.some((n) => !Number.isFinite(n) || n < 0)) {
  console.error(`[capture] invalid --pids: ${values.pids}`);
  process.exit(2);
}

if (!Number.isFinite(durationSec) || durationSec <= 0) {
  console.error(`[capture] invalid --duration: ${values.duration}`);
  process.exit(2);
}

// --- output stream ---------------------------------------------------------
const out = fs.createWriteStream(outPath, { flags: "a" });

function record(obj: Record<string, unknown>): void {
  out.write(JSON.stringify(obj) + "\n");
}

// --- counters --------------------------------------------------------------
type ConnStats = {
  url?: string;
  source?: string;
  sent: number;
  received: number;
  text: number;
  binary: number;
  control: number;
  bytes: number;
  closed: boolean;
  createdAt?: string;
  closedAt?: string;
  perPid: Map<string, { sent: number; received: number }>;
};

const stats = {
  totalFrames: 0,
  perConnection: new Map<string, ConnStats>(),
  perPidGlobal: new Map<string, { sent: number; received: number }>(),
  errors: [] as Array<{ ts: string; requestId: string; errorMessage: string }>,
  firstFrameTs: null as string | null,
  lastFrameTs: null as string | null,
};

function conn(requestId: string): ConnStats {
  let c = stats.perConnection.get(requestId);
  if (!c) {
    c = {
      sent: 0,
      received: 0,
      text: 0,
      binary: 0,
      control: 0,
      bytes: 0,
      closed: false,
      perPid: new Map(),
    };
    stats.perConnection.set(requestId, c);
  }
  return c;
}

function bumpPid(
  c: ConnStats,
  pidLabel: string,
  direction: "sent" | "received",
): void {
  let p = c.perPid.get(pidLabel);
  if (!p) {
    p = { sent: 0, received: 0 };
    c.perPid.set(pidLabel, p);
  }
  p[direction]++;
  let g = stats.perPidGlobal.get(pidLabel);
  if (!g) {
    g = { sent: 0, received: 0 };
    stats.perPidGlobal.set(pidLabel, g);
  }
  g[direction]++;
}

function extractPid(payload: string, isBinary: boolean): string {
  if (isBinary) return "(binary)";
  try {
    const o = JSON.parse(payload);
    if (o && typeof o === "object" && !Array.isArray(o)) {
      const p = (o as Record<string, unknown>).PID;
      if (typeof p === "string" || typeof p === "number") return String(p);
      const sub = (o as Record<string, unknown>).eventPid;
      if (Array.isArray(sub)) return "(subscribe)";
      return "(no PID)";
    }
    return "(non-object)";
  } catch {
    return "(non-JSON)";
  }
}

function noteFrame(
  ts: string,
  c: ConnStats,
  opcode: number,
  payloadData: string,
  direction: "sent" | "received",
  isBase64: boolean,
): void {
  stats.totalFrames++;
  if (!stats.firstFrameTs) stats.firstFrameTs = ts;
  stats.lastFrameTs = ts;
  c[direction]++;
  if (opcode === 1) c.text++;
  else if (opcode === 2) c.binary++;
  else c.control++;
  c.bytes += payloadData ? payloadData.length : 0;
  if (opcode === 1 || opcode === 2) {
    const label = extractPid(payloadData, isBase64);
    bumpPid(c, label, direction);
  }
}

// --- lap-history backfill WS -----------------------------------------------
// Opens a parallel WS to LTS that subscribes to PID=7 with the json-envelope
// form {session, startingNo:""} the SPA never sends. The server only emits
// the cumulative per-car lap-history dump in response to this form. Frames
// captured here are tagged `source: "lapHistory"` so the analyzer can group
// them separately.
let lapHistoryStarted = false;
let lapHistoryWs: WebSocket | null = null;
const LAP_HISTORY_REQ_ID = "lapHistoryWS";

function maybeStartLapHistory(payloadData: string): void {
  if (lapHistoryStarted) return;
  if (!pids.includes(7)) return;
  let session: string | undefined;
  let eventId: string | undefined;
  try {
    const o = JSON.parse(payloadData);
    if (o && typeof o === "object" && !Array.isArray(o)) {
      const s = (o as Record<string, unknown>).SESSION;
      const ev = (o as Record<string, unknown>).EXPORTID;
      if (typeof s === "string" && s.length > 0) session = s;
      if (typeof ev === "string" && ev.length > 0) eventId = ev;
    }
  } catch {
    return;
  }
  if (!session || !eventId) return;
  lapHistoryStarted = true;
  startLapHistoryWs(eventId, session);
}

function startLapHistoryWs(eventId: string, session: string): void {
  const ts = new Date().toISOString();
  const c = conn(LAP_HISTORY_REQ_ID);
  c.url = LTS_WS_URL;
  c.source = "lapHistory";
  c.createdAt = ts;
  record({
    ts,
    kind: "webSocketCreated",
    requestId: LAP_HISTORY_REQ_ID,
    url: LTS_WS_URL,
    source: "lapHistory",
  });
  const ws = new WebSocket(LTS_WS_URL, { origin: LTS_WS_ORIGIN });
  lapHistoryWs = ws;
  ws.on("open", () => {
    const subTs = new Date().toISOString();
    record({
      ts: subTs,
      kind: "webSocketHandshakeResponseReceived",
      requestId: LAP_HISTORY_REQ_ID,
      status: 101,
      statusText: "Switching Protocols",
      source: "lapHistory",
    });
    const subPayload = JSON.stringify({
      eventId,
      eventPid: [7],
      clientLocalTime: Date.now(),
      json: { session, startingNo: "" },
    });
    noteFrame(subTs, c, 1, subPayload, "sent", false);
    record({
      ts: subTs,
      kind: "webSocketFrameSent",
      requestId: LAP_HISTORY_REQ_ID,
      opcode: 1,
      payloadData: subPayload,
      payloadIsBase64: false,
      source: "lapHistory",
    });
    ws.send(subPayload);
    console.log(`[capture] lap-history WS subscribed (session=${session})`);
  });
  ws.on("message", (data: Buffer) => {
    const mts = new Date().toISOString();
    const payload = data.toString("utf8");
    noteFrame(mts, c, 1, payload, "received", false);
    record({
      ts: mts,
      kind: "webSocketFrameReceived",
      requestId: LAP_HISTORY_REQ_ID,
      opcode: 1,
      payloadData: payload,
      payloadIsBase64: false,
      source: "lapHistory",
    });
  });
  ws.on("error", (err: Error) => {
    stats.errors.push({
      ts: new Date().toISOString(),
      requestId: LAP_HISTORY_REQ_ID,
      errorMessage: err.message,
    });
  });
  ws.on("close", () => {
    c.closed = true;
    c.closedAt = new Date().toISOString();
    record({
      ts: c.closedAt,
      kind: "webSocketClosed",
      requestId: LAP_HISTORY_REQ_ID,
      source: "lapHistory",
    });
  });
}

// --- main ------------------------------------------------------------------
async function main(): Promise<void> {
  console.log(`[capture] url       = ${url}`);
  console.log(`[capture] duration  = ${durationSec}s`);
  console.log(`[capture] out       = ${outPath}`);
  console.log(`[capture] headed    = ${headed}`);
  console.log(`[capture] pids      = ${pids.join(",")}`);

  const browser = await chromium.launch({ headless: !headed });
  const context: BrowserContext = await browser.newContext();
  // Rewrite the SPA's subscription frame so we get the wider PID set the page
  // never asks for on its own. Pages send {eventId, eventPid, clientLocalTime}
  // both on open and on 15s heartbeats — patching .send catches both.
  await context.addInitScript(
    `(() => {
      const PIDS = ${JSON.stringify(pids)};
      const origSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        if (typeof data === "string") {
          try {
            const o = JSON.parse(data);
            if (o && Array.isArray(o.eventPid)) {
              o.eventPid = PIDS;
              return origSend.call(this, JSON.stringify(o));
            }
          } catch (_e) {}
        }
        return origSend.call(this, data);
      };
    })();`,
  );
  const page: Page = await context.newPage();

  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");

  // CDP event names aren't in Playwright's typed event map; the payloads are
  // documented at https://chromedevtools.github.io/devtools-protocol/tot/Network/
  /* eslint-disable @typescript-eslint/no-explicit-any */
  cdp.on("Network.webSocketCreated" as any, (e: any) => {
    const ts = new Date().toISOString();
    const c = conn(e.requestId);
    c.url = e.url;
    c.createdAt = ts;
    record({ ts, kind: "webSocketCreated", requestId: e.requestId, url: e.url });
  });

  cdp.on("Network.webSocketWillSendHandshakeRequest" as any, (e: any) => {
    const ts = new Date().toISOString();
    conn(e.requestId);
    record({
      ts,
      kind: "webSocketWillSendHandshakeRequest",
      requestId: e.requestId,
      headers: e.request?.headers,
    });
  });

  cdp.on("Network.webSocketHandshakeResponseReceived" as any, (e: any) => {
    const ts = new Date().toISOString();
    conn(e.requestId);
    record({
      ts,
      kind: "webSocketHandshakeResponseReceived",
      requestId: e.requestId,
      headers: e.response?.headers,
      status: e.response?.status,
      statusText: e.response?.statusText,
    });
  });

  cdp.on("Network.webSocketFrameSent" as any, (e: any) => {
    const ts = new Date().toISOString();
    const c = conn(e.requestId);
    const opcode: number = e.response?.opcode;
    const payloadData: string = e.response?.payloadData ?? "";
    const isBinary = opcode === 2;
    noteFrame(ts, c, opcode, payloadData, "sent", isBinary);
    record({
      ts,
      kind: "webSocketFrameSent",
      requestId: e.requestId,
      opcode,
      payloadData,
      payloadIsBase64: isBinary,
    });
  });

  cdp.on("Network.webSocketFrameReceived" as any, (e: any) => {
    const ts = new Date().toISOString();
    const c = conn(e.requestId);
    const opcode: number = e.response?.opcode;
    const payloadData: string = e.response?.payloadData ?? "";
    const isBinary = opcode === 2;
    noteFrame(ts, c, opcode, payloadData, "received", isBinary);
    record({
      ts,
      kind: "webSocketFrameReceived",
      requestId: e.requestId,
      opcode,
      payloadData,
      payloadIsBase64: isBinary,
    });
    // Once the SPA's WS yields a frame with a SESSION id, open a parallel WS
    // dedicated to the PID=7 lap-history backfill. The cumulative form only
    // triggers when the subscribe carries a {session, startingNo} envelope,
    // which the SPA never sends.
    maybeStartLapHistory(payloadData);
  });

  cdp.on("Network.webSocketFrameError" as any, (e: any) => {
    const ts = new Date().toISOString();
    conn(e.requestId);
    stats.errors.push({ ts, requestId: e.requestId, errorMessage: e.errorMessage });
    record({
      ts,
      kind: "webSocketFrameError",
      requestId: e.requestId,
      errorMessage: e.errorMessage,
    });
  });

  cdp.on("Network.webSocketClosed" as any, (e: any) => {
    const ts = new Date().toISOString();
    const c = conn(e.requestId);
    c.closed = true;
    c.closedAt = ts;
    record({ ts, kind: "webSocketClosed", requestId: e.requestId });
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Navigate. Don't await — streaming SPAs may never reach networkidle.
  page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch((err) => {
    console.error(`[capture] navigation error (continuing to listen): ${err.message}`);
  });

  // Progress reporter
  const startMs = Date.now();
  let lastReportMs = startMs;
  let lastFrameCount = 0;
  const progress = setInterval(() => {
    const now = Date.now();
    const elapsed = (now - startMs) / 1000;
    const delta = stats.totalFrames - lastFrameCount;
    const dt = Math.max((now - lastReportMs) / 1000, 0.001);
    const rate = delta / dt;
    console.log(
      `[capture] t=${elapsed.toFixed(1).padStart(6)}s  frames=${String(stats.totalFrames).padStart(6)}  ` +
        `rate=${rate.toFixed(1)}/s  conns=${stats.perConnection.size}`,
    );
    lastReportMs = now;
    lastFrameCount = stats.totalFrames;
  }, 10_000);

  // Wait for duration OR SIGINT, whichever comes first.
  let interrupted = false;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), durationSec * 1000);
    process.once("SIGINT", () => {
      interrupted = true;
      clearTimeout(timer);
      console.log("\n[capture] SIGINT received — stopping early.");
      resolve();
    });
  });

  clearInterval(progress);

  // Tear down
  try {
    if (lapHistoryWs && lapHistoryWs.readyState === WebSocket.OPEN) {
      lapHistoryWs.close();
    }
  } catch (err) {
    console.error(`[capture] error closing lapHistory ws: ${(err as Error).message}`);
  }
  try {
    await browser.close();
  } catch (err) {
    console.error(`[capture] error closing browser: ${(err as Error).message}`);
  }
  // Allow any in-flight close events to flush before ending the stream.
  await new Promise((r) => setTimeout(r, 100));
  await new Promise<void>((resolve) => out.end(resolve));

  // --- summary -------------------------------------------------------------
  const totalDuration = (Date.now() - startMs) / 1000;
  console.log("\n=== Capture summary ===");
  console.log(`Elapsed:      ${totalDuration.toFixed(1)}s${interrupted ? " (interrupted)" : ""}`);
  console.log(`Output:       ${outPath}`);
  console.log(`Total frames: ${stats.totalFrames}`);
  console.log(`First frame:  ${stats.firstFrameTs ?? "—"}`);
  console.log(`Last frame:   ${stats.lastFrameTs ?? "—"}`);
  console.log(`Connections:  ${stats.perConnection.size}`);
  for (const [reqId, c] of stats.perConnection) {
    const state = c.closed ? `closed @ ${c.closedAt}` : "still open";
    const srcTag = c.source ? `  source=${c.source}` : "";
    console.log(
      `  [${reqId}] ${c.url ?? "?"}${srcTag}\n` +
        `    sent=${c.sent}  received=${c.received}  ` +
        `text=${c.text}  binary=${c.binary}  control=${c.control}  ` +
        `payloadBytes≈${c.bytes}  (${state})`,
    );
    const pidEntries = [...c.perPid.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (pidEntries.length) {
      console.log(`    by PID:`);
      for (const [pid, n] of pidEntries) {
        console.log(
          `      PID=${pid.padEnd(14)} sent=${String(n.sent).padStart(4)}  received=${String(n.received).padStart(5)}`,
        );
      }
    }
  }
  if (stats.perPidGlobal.size) {
    console.log(`Frames by PID (all connections):`);
    const all = [...stats.perPidGlobal.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [pid, n] of all) {
      console.log(
        `  PID=${pid.padEnd(14)} sent=${String(n.sent).padStart(4)}  received=${String(n.received).padStart(5)}`,
      );
    }
  }
  if (stats.errors.length) {
    console.log(`Errors (${stats.errors.length}):`);
    for (const e of stats.errors) {
      console.log(`  ${e.ts}  ${e.requestId}  ${e.errorMessage}`);
    }
  } else {
    console.log("Errors:       none");
  }
}

main().catch((err) => {
  console.error("[capture] fatal:", err);
  process.exit(1);
});
