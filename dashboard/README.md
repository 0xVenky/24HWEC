# FastN24 — Live Timing Dashboard

F1-style live timing UI for `livetiming.azurewebsites.net` (24h Nürburgring
and related ADAC events). Built on the schema reverse-engineered in
[`../PROTOCOL.md`](../PROTOCOL.md).

Stack: Vite + React 18 + TypeScript + Tailwind. The dev server proxies the
upstream WebSocket through `/lts-ws` so the browser's `Origin` header is
rewritten to one the upstream accepts.

## Run

```sh
cd dashboard
npm install
npm run dev
# → http://localhost:5173
```

By default the dashboard subscribes to event `50` (24h Nürburgring qualifying
in the captured sample). Pick a different event by appending `?event=NN` to
the URL — the value is passed to the upstream as the `eventId` field in the
subscription frame.

To connect directly (no Vite proxy) — e.g. when hosting the built bundle
elsewhere — set `VITE_LTS_WS_URL`:

```sh
VITE_LTS_WS_URL=wss://livetiming.azurewebsites.net/ npm run build
```

## Columns

Single combined view (no tabs) — the Nordschleife pushes nine intermediates
so every sector gets its own column. The column count auto-adapts from
`NROFINTERMEDIATETIMES` in the live feed.

| Column          | Source                                            |
| --------------- | ------------------------------------------------- |
| POS / #         | overall position, start number                    |
| Class bar       | colour-coded `CLASSNAME`                          |
| Driver / Car    | `NAME` (title-cased / "Lastname, Firstname" flipped to "Firstname Lastname"), `CAR · TEAM` |
| LAP             | completed lap count                               |
| LAST LAP / BEST | `LASTLAPTIME` and `FASTESTLAP`                    |
| GAP / INT       | gap to leader and interval to car ahead           |
| S1 … S9         | `S1TIME` … `S9TIME`, green = personal best, violet = overall best |
| Δ               | `CHG` — positions gained/lost since last refresh   |
| CLASS           | full class label + in-class rank                  |

## Hover card

Hovering a row opens a detail card positioned to the side of the row. The
card surfaces signals you actually look for while watching a race:

- Class metadata: tagline, plain-English description, eligible cars (see [`src/lib/classMeta.ts`](src/lib/classMeta.ts))
- This car's overall position, class rank ("P3 in SP 9 of 41"), PRO badge
- Last lap / best lap / gap / interval / pit summary / current sector
- Class fastest lap with the driver who set it
- Team cross-reference: the other entries from the same team in this race

## Filters

- Free-text search across driver, car, team, start number and class
- Quick-pill groups: GT3 (SP9 family), Cup, SP 10, BMW, VT, V-series, SP-X, SP 3T/4T/2T, SP 7/8, AT, TCR
- Class multi-select dropdown (counts come from the live data)
- "Hide stationary (LAPS = 0)" to drop cars that haven't completed an out-lap

Filters apply to all four tabs simultaneously.

## Visual conventions

- Position 1 is highlighted; rows alternate shading otherwise
- Class colour bar matches the entry's `CLASSNAME` (predefined for SP9 et al., deterministic-hash fallback for unknown classes)
- Sector pills: yellow = normal, green = personal best for the car, violet = overall best across all cars shown. Bests are computed locally from `S<n>TIME` because the server's `ST<n>T` / `ST<n>V` flags were all zero in the captured sample.
- `PRO` badge on drivers whose result row has `PRO == "PRO"`
- `Pit` badge when the car's `LASTINTERMEDIATENUMBER` is `0` and it has at least one completed lap
- Status pill in the header: ● GREEN / YELLOW / RED / FINISHED comes from `TRACKSTATE`; the secondary pill is `TIMESTATE`; the small dot is the WebSocket connection state

## How it talks to the server

On every successful WS open the client sends:

```json
{"eventId": "50", "eventPid": [0, 3, 4, 7, 9002], "clientLocalTime": 1778783171851}
```

The server then streams:

- `PID=0` — full standings snapshot (~1 Hz)
- `PID=3` — cumulative race-control / steward messages (de-duped by `ID`)
- `PID=4` — session/track state (on change)
- `PID=7` — lap events:
  - `TYPE=1` — one-shot class-best progression dump shortly after subscribe
  - `TYPE=0` — per-car cumulative lap history. Each frame carries the car's
    complete `L=1..N` record sorted by lap number; on arrival the dashboard
    replaces the car's lap list (not append-and-dedupe).
- `PID=9002` — class statistics (`LEADING[]`, `BESTLAPS[]`, `BESTSECTORS[]`).
  Initial push is ~188 KB; subsequent updates are incremental.

The same subscription is resent every 15 s to keep the pipe warm and bump
`clientLocalTime` for time-sync purposes.

Reconnect uses exponential backoff up to 15 s.

### PID=7 backfill — the json envelope

The page's combined `eventPid: [0, 3, 4, 7, 9002]` subscription only yields
PID=7 frames as new laps complete. To get the cumulative per-car history the
server requires a different subscription shape — a `json` envelope carrying
the current session id:

```json
{
  "eventId": "50",
  "eventPid": [7],
  "clientLocalTime": 1778783171851,
  "json": { "session": "4600205004", "startingNo": "" }
}
```

`session` comes from any prior PID=0 or PID=4 frame's `SESSION` field;
`startingNo` is ignored by the server (verified live) — send empty. The
project's [`capture.ts`](../capture.ts) opens a parallel WS in this form
once it sees a session id and tags those frames `source: "lapHistory"` in
the JSONL.

The browser dashboard does **not** open this second socket — it relies on
the page subscription, so laps that completed before the WS opened are not
back-filled. See the out-of-scope note below.

## Race Control panel

A collapsible right-hand panel surfaces all `PID=3` messages. The frame
carries the cumulative session history each tick; the dashboard de-dupes by
`ID` so old messages aren't churned. Rows are toned by content:

- Red — "red flag", "stop and go", "disqualified"
- Amber — "investigation", "code 60", "technical flag", "penalty"
- Green — "no further action", "cleared"
- Neutral otherwise

`#NN` references in the body are rendered as clickable chips that focus the
timing table's search on that start number. The header shows an unread badge
when the panel is collapsed and new IDs arrive; opening the panel acks them.

The panel defaults open on screens ≥ 1280 px wide and collapsed below.

## Lap chart

Header button "Lap chart" swaps the timing table for a stint-chart-style
grid: rows are cars (filtered by the same FilterBar), columns are lap
numbers 1..N. Each cell is coloured by the lap's pace relative to that car's
own median across the laps received so far — green tints for faster,
red tints for slower, amber for pit-flagged outliers. Hovering a cell shows
the full sector breakdown.

Laps come from `PID=7 TYPE=0` events. The dashboard does not open the
parallel "lap-history" socket described above, so laps that completed before
the WS opened are missing from the chart — only laps that close while we are
connected appear. The driver attribution is reliable for those laps.

Retrospective per-lap history is not implemented in this pass. For NLS
events (the season around the 24h race), wige publishes a "Lap by Lap" PDF
at e.g. `nuerburgring-langstrecken-serie.de/wp-content/uploads/ergebnisse/<yyyy-mm-dd>rl.pdf`
that encodes per-lap driver numbers. The same operator does **not** appear
to publish one for the 24h race itself (verified against 2024/2025 file
lists on `24h-rennen.de`); the only retrospective source there is the ADAC
results PDF, which is a final classification rather than a lap log.

## Hover card — Recent laps

The row-hover card now includes a "Recent laps" section showing the last 5
lap events for that car: lap number, total lap time (sum of sector times —
the server's `T` field is unreliable), sector pills (S1–S9 with violet
shading for the best-of-this-window in each sector), and the driver name
recorded at the time the lap completed.

Driver attribution rule: PID=7 TYPE=0 carries the car's full cumulative lap
list. The first time we see a car, every lap is treated as backfill and
shown as `backfill` instead of a name — we can't attribute retroactively.
On subsequent frames the existing attribution is preserved for laps we
already had; any *new* lap (`L` greater than the previous max for the car)
is attributed to the driver currently in the latest `PID=0` snapshot. A
surname change between consecutive newly-resolved laps for the same car
implies a driver swap during the intervening pit stop.
