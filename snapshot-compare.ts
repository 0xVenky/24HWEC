// One-shot snapshot: load upstream + dashboard in parallel, capture the last
// PID=0 WS frame seen by the upstream tab, and read both tables' DOM as close
// in time as possible. Output is one JSON object with { A, B, C, meta }.
//
// Usage: npx tsx snapshot-compare.ts --out ./compare-snapshot.json --waitMs 20000

import { chromium, type Page } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";

const UPSTREAM_URL = "https://livetiming.azurewebsites.net/event=50?config=w3";
const DASHBOARD_URL = "http://localhost:5173/";

const { values } = parseArgs({
  options: {
    out: { type: "string", default: "./compare-snapshot.json" },
    waitMs: { type: "string", default: "20000" },
    headed: { type: "boolean", default: false },
  },
  strict: true,
});
const outPath = path.resolve(values.out!);
const waitMs = Number.parseInt(values.waitMs!, 10);

interface RawTableRow {
  cells: string[];
  classes: string[];
  rowClass: string;
}

async function readUpstreamTable(page: Page): Promise<{ headers: string[]; rows: RawTableRow[] }> {
  return await page.evaluate(() => {
    // Upstream livetiming.azurewebsites.net renders the standings as an HTML
    // table — find the biggest table on the page and extract it cell-by-cell.
    const tables = Array.from(document.querySelectorAll("table"));
    let best: HTMLTableElement | null = null;
    let bestRows = 0;
    for (const t of tables) {
      const rs = t.querySelectorAll("tr").length;
      if (rs > bestRows) {
        bestRows = rs;
        best = t as HTMLTableElement;
      }
    }
    if (!best) return { headers: [], rows: [] };
    const headerRow = best.querySelector("thead tr") ?? best.querySelector("tr");
    const headers = headerRow
      ? Array.from(headerRow.querySelectorAll("th,td")).map((c) =>
          ((c as HTMLElement).innerText ?? "").trim(),
        )
      : [];
    // Body rows are everything except the header.
    const bodyRows = Array.from(best.querySelectorAll("tbody tr"));
    const rows = bodyRows.map((tr) => {
      const cells = Array.from(tr.querySelectorAll("td,th")).map((c) =>
        ((c as HTMLElement).innerText ?? "").replace(/\s+/g, " ").trim(),
      );
      const classes = Array.from(tr.querySelectorAll("td,th")).map(
        (c) => (c as HTMLElement).className ?? "",
      );
      return { cells, classes, rowClass: (tr as HTMLElement).className ?? "" };
    });
    return { headers, rows };
  });
}

async function readDashboardTable(page: Page): Promise<{ headers: string[]; rows: RawTableRow[] }> {
  return await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll("table"));
    let best: HTMLTableElement | null = null;
    let bestRows = 0;
    for (const t of tables) {
      const rs = t.querySelectorAll("tr").length;
      if (rs > bestRows) {
        bestRows = rs;
        best = t as HTMLTableElement;
      }
    }
    if (!best) return { headers: [], rows: [] };
    const headerRow = best.querySelector("thead tr") ?? best.querySelector("tr");
    const headers = headerRow
      ? Array.from(headerRow.querySelectorAll("th,td")).map((c) =>
          ((c as HTMLElement).innerText ?? "").trim(),
        )
      : [];
    const bodyRows = Array.from(best.querySelectorAll("tbody tr"));
    const rows = bodyRows.map((tr) => {
      const cells = Array.from(tr.querySelectorAll("td,th")).map((c) =>
        ((c as HTMLElement).innerText ?? "").replace(/\s+/g, " ").trim(),
      );
      const classes = Array.from(tr.querySelectorAll("td,th")).map(
        (c) => (c as HTMLElement).className ?? "",
      );
      return { cells, classes, rowClass: (tr as HTMLElement).className ?? "" };
    });
    return { headers, rows };
  });
}

async function main(): Promise<void> {
  console.log(`[snapshot] starting; waitMs=${waitMs}`);
  const browser = await chromium.launch({ headless: !values.headed });
  const ctx = await browser.newContext();

  // We use *two* pages in one context. The upstream page's WS frames are what
  // we treat as canonical (snapshot A). Both pages talk to the same backend.
  const upstream = await ctx.newPage();
  const dashboard = await ctx.newPage();

  const cdp = await ctx.newCDPSession(upstream);
  await cdp.send("Network.enable");

  let lastPid0Payload: string | null = null;
  let lastPid0Ts: string | null = null;
  let pid0Count = 0;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  cdp.on("Network.webSocketFrameReceived" as any, (e: any) => {
    const opcode: number = e.response?.opcode;
    if (opcode !== 1) return;
    const payload: string = e.response?.payloadData ?? "";
    if (!payload) return;
    // Quick check before JSON.parse: PID=0 frames are huge.
    if (payload.length < 1000) return;
    if (payload.startsWith('{"PID":"0"')) {
      lastPid0Payload = payload;
      lastPid0Ts = new Date().toISOString();
      pid0Count++;
    }
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  console.log(`[snapshot] navigating both tabs in parallel…`);
  const navStart = Date.now();
  await Promise.all([
    upstream.goto(UPSTREAM_URL, { waitUntil: "domcontentloaded", timeout: 60_000 }),
    dashboard.goto(DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 60_000 }),
  ]);
  console.log(`[snapshot] both DOMContentLoaded in ${Date.now() - navStart}ms`);

  // Wait long enough for both pages to receive their first big snapshot and
  // for the table to be populated. We also want a second PID=0 if possible so
  // that the data is "fresh" rather than the initial.
  await new Promise<void>((r) => setTimeout(r, waitMs));

  // Read both DOMs essentially back-to-back. We try to get the upstream and
  // dashboard snapshots within tens of ms of each other.
  console.log(`[snapshot] reading DOMs…`);
  const readStart = Date.now();
  const tsB = new Date().toISOString();
  const upstreamTable = await readUpstreamTable(upstream);
  const tsC = new Date().toISOString();
  const dashboardTable = await readDashboardTable(dashboard);
  const tsReadEnd = new Date().toISOString();

  console.log(
    `[snapshot] DOM reads done in ${Date.now() - readStart}ms; ` +
      `upstream rows=${upstreamTable.rows.length}, dashboard rows=${dashboardTable.rows.length}`,
  );
  console.log(`[snapshot] saw ${pid0Count} PID=0 frames; last @ ${lastPid0Ts}`);

  if (!lastPid0Payload) {
    console.error("[snapshot] no PID=0 frame captured!");
  }

  let parsedA: unknown = null;
  try {
    parsedA = lastPid0Payload ? JSON.parse(lastPid0Payload) : null;
  } catch (err) {
    console.error("[snapshot] failed to parse last PID=0:", err);
  }

  const out = {
    meta: {
      capturedAt: new Date().toISOString(),
      navStartMs: navStart,
      waitMs,
      readDurationMs: Date.now() - readStart,
      pid0FrameCount: pid0Count,
      tsA: lastPid0Ts,
      tsB,
      tsC,
      tsReadEnd,
      upstreamUrl: UPSTREAM_URL,
      dashboardUrl: DASHBOARD_URL,
    },
    A: parsedA,
    B: upstreamTable,
    C: dashboardTable,
  };

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`[snapshot] wrote ${outPath} (${fs.statSync(outPath).size} bytes)`);

  await browser.close();
}

main().catch((err) => {
  console.error("[snapshot] fatal:", err);
  process.exit(1);
});
