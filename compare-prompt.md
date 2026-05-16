# Prompt: dashboard ↔ upstream live-timing comparison

Paste the section below into a fresh Claude Code session. It is self-contained — the new agent has no memory of how the dashboard was built.

---

You're auditing a live-timing dashboard against the upstream site it mirrors. Both consume the same WebSocket; the dashboard at `/Users/venky/Projects/24HWEC/dashboard` is a React/Vite reimplementation of [https://livetiming.azurewebsites.net/event=50?config=w3](https://livetiming.azurewebsites.net/event=50?config=w3) for the ADAC 24h Nürburgring (event id `50`).

Your job: take a synchronised snapshot of both UIs and the underlying WebSocket, compare what each shows for the same cars, and report any discrepancies that aren't just due to the ~1–2-second refresh drift between snapshots. Keep the verdict tight; the most useful outcome is "no real bugs" if that's what's true.

## Setup

1. **Project root:** `/Users/venky/Projects/24HWEC` — read `README.md` and `PROTOCOL.md` here first.
2. **Start the dashboard:**
   ```sh
   cd /Users/venky/Projects/24HWEC/dashboard
   npm install   # if node_modules is missing
   npm run dev   # serves at http://localhost:5173
   ```
   The dev server proxies `wss://livetiming.azurewebsites.net` through `/lts-ws/` (Origin rewrite).
3. **Upstream:** `https://livetiming.azurewebsites.net/event=50?config=w3`
4. **Schema reference:** `PROTOCOL.md` documents the `PID=0` snapshot shape — every full standings update is one big JSON object with a `RESULT[]` array. Cars are uniquely keyed by `STNR` (start number).

## Comparison plan

You need three observations taken within ~2 seconds of each other:
- **A** — a `PID=0` frame from the WebSocket (canonical truth).
- **B** — the upstream site's table rendering of that frame.
- **C** — our dashboard's table rendering of that frame.

Steps:
1. From the project root, run
   ```sh
   npx tsx capture.ts --duration 6 --out ./compare-frames.jsonl
   ```
   This captures a few seconds of frames via the existing recorder.
2. Pick the **last** `PID=0` frame from `compare-frames.jsonl`. Parse its `RESULT` array — that's **A**.
3. Load both pages with browser automation. **Prefer Claude in Chrome MCP** (tools are deferred — discover them via `ToolSearch` for `mcp__Claude_in_Chrome__*` and load `tabs_context_mcp`, `tabs_create_mcp`, `navigate`, `read_page`, `read_console_messages`). Playwright is also installed if you'd rather drive Chromium headless from a TS script.
   - Tab 1 → upstream URL → read the table DOM into **B**
   - Tab 2 → `http://localhost:5173` → read the dashboard table DOM into **C**
4. Match rows across A / B / C by `STNR`.
5. Compare these fields for the **first 25 rows by overall `POSITION`** (focus on the front of the field; the long tail mostly drifts):
   - `POSITION`, `CLASSNAME`, `STNR`, `NAME`, `CAR`, `TEAM`, `LAPS`, `LASTLAPTIME`, `FASTESTLAP` (shown as "BEST"), `GAP`, `INT`, and `S1TIME`…`S9TIME`.
6. **Known intentional display transforms** in our dashboard — do NOT flag these as bugs:
   - `NAME`: title-cases ALL-CAPS surnames; flips `"Lastname, Firstname"` → `"Firstname Lastname"`. See `dashboard/src/lib/format.ts → formatDriverName`.
   - `CLASSNAME`: rendered with a coloured bar (`dashboard/src/lib/classes.ts`).
   - Sector cells get green (personal best) / violet (overall best) tint, computed locally from `S<n>TIME`. See `getSectorTone` in `dashboard/src/components/TimingTable.tsx`.
   - Empty-string numeric fields (e.g. `S7TIME == ""`) render as `—`.
   - `GAP`/`INT` with no leading sign get a `+` prefix.
   - Rows are sorted by parsed `POSITION` ascending; the upstream may sort or group by class.
7. **Drift-prone fields:** `LASTLAPTIME` and the current sector time can legitimately differ between B and C if a car crossed a sector boundary in the gap between snapshots. Flag a diff only if the values can't be explained by ~2 s of race time.

## Report

Output one markdown report. Keep it under ~800 words.

1. **Snapshot metadata** — wall-clock timestamps for A/B/C, time gap between them, and the frame's `RECNUM` if present.
2. **Matched OK** — one-line count, e.g. "23 of 25 rows match across all 12 fields."
3. **Dashboard ↔ WS diffs** *(most important)* — for each diff: `STNR`, field, WS value, dashboard value, your assessment ("intentional transform" / "bug" / "drift"). If "bug", point at the offending file:line.
4. **Upstream ↔ WS diffs** — usually empty. If the upstream UI reinterprets a field (e.g. divides a millisecond timestamp differently), it surfaces here.
5. **Likely drift** — quick list, don't dwell.
6. **Recommendations** — concrete fixes, with file paths.

If you find no real bugs, say so explicitly in section 3.

## Tools

- Claude in Chrome MCP (`mcp__Claude_in_Chrome__*`) — schemas are deferred; load with `ToolSearch` before calling.
- Playwright is installed at the project root and used by `capture.ts`.
- `jq` for inspecting `compare-frames.jsonl`.

## Out of scope

- No redesigning the dashboard's UX. Data fidelity only.
- No new WS PID reverse-engineering.
- No CSS/colour suggestions unless they materially misrepresent data.
