# FastN24 — WebSocket capture

Raw WebSocket capture for the Azure-hosted live timing SPA at
`https://livetiming.azurewebsites.net`. Hooks the Chrome DevTools Protocol via
Playwright so the handshake (headers, status) and every frame are recorded —
no filtering, no decoding.

## Install

```sh
npm install
npx playwright install chromium
```

`npm install` pulls Playwright; `playwright install chromium` downloads the
matching Chromium build the first time.

## Run

```sh
npx tsx capture.ts
```

That captures the default URL for 120s into `./frames.jsonl`. Flags:

| Flag         | Default                                                            | Meaning                                     |
| ------------ | ------------------------------------------------------------------ | ------------------------------------------- |
| `--url`      | `https://livetiming.azurewebsites.net/event=50?config=w3`          | Page to load                                |
| `--duration` | `120`                                                              | Seconds to capture                          |
| `--out`      | `./frames.jsonl`                                                   | JSONL output path (append-mode)             |
| `--headed`   | `false`                                                            | Show the browser window (debugging)         |
| `--pids`     | `0,3,4,7,9002`                                                     | Comma-separated PIDs to subscribe to        |

The page's own JS subscribes to `[0,4]` only. Capture monkey-patches
`WebSocket.prototype.send` so the outbound subscription frame is rewritten to
include the wider PID set — without that, the server volunteers nothing
extra. Additionally, once the first PID=0/4 frame yields a `SESSION` id, the
capture script opens a *second* WebSocket dedicated to PID=7 with the
`json: {session, startingNo: ""}` envelope. That triggers the server's
cumulative per-car lap-history dump (the page subscription only emits live
new-lap events). Those frames are tagged `source: "lapHistory"` in the
JSONL output so the analyzer can group them separately. Override `--pids`
to probe other PIDs:

```sh
# Standings + session only (matches the upstream UI)
npx tsx capture.ts --duration 30 --pids 0,4 --out ./standings.jsonl

# Wider sweep
npx tsx capture.ts --duration 30 --pids 0,1,2,3,4,5,6,7,8,9 --out ./probe.jsonl
```

Example: 30-second smoke test to a custom path:

```sh
npx tsx capture.ts --duration 30 --out ./smoke.jsonl
```

Progress prints every 10s; a per-connection summary prints on exit (Ctrl-C
also triggers the summary). The summary now breaks frame counts down by PID
(both per-connection and across all connections) so you can see at a glance
which streams the server actually sent.

## Output format

`frames.jsonl` is one JSON object per line. Common fields:

- `ts` — ISO 8601 timestamp when the CDP event was received
- `kind` — CDP event name without the `Network.` prefix
  (`webSocketCreated`, `webSocketWillSendHandshakeRequest`,
  `webSocketHandshakeResponseReceived`, `webSocketFrameSent`,
  `webSocketFrameReceived`, `webSocketFrameError`, `webSocketClosed`)
- `requestId` — stable CDP id; use it to group frames per connection
- `url`, `headers`, `status`, `statusText` — handshake events
- `opcode`, `payloadData`, `payloadIsBase64` — frame events. Text frames
  (opcode 1) store the payload as a UTF-8 string; binary frames (opcode 2)
  are base64-encoded and flagged with `payloadIsBase64: true`. Control
  frames (ping/pong/close) may also appear.
- `errorMessage` — frame-error events

The file is opened in append mode, so repeated runs concatenate. Delete or
rotate between sessions if you want clean slices.

### Quick inspection with `jq`

List unique WebSocket URLs and per-connection frame counts:

```sh
jq -r 'select(.kind=="webSocketCreated") | "\(.requestId)\t\(.url)"' frames.jsonl
jq -r '.requestId' frames.jsonl | sort | uniq -c | sort -rn
```

Peek at the first 5 received text frames (decoded):

```sh
jq -c 'select(.kind=="webSocketFrameReceived" and .opcode==1) | .payloadData' frames.jsonl | head -5
```

Count event kinds:

```sh
jq -r '.kind' frames.jsonl | sort | uniq -c
```

Dump handshake response headers for the first connection:

```sh
jq 'select(.kind=="webSocketHandshakeResponseReceived")' frames.jsonl | head
```

## Schema inference

`analyze.ts` walks a `frames.jsonl`, groups frames by connection and `PID`,
infers field types with example values, and writes a Markdown report
(`PROTOCOL.md` by default) including a proposed TypeScript discriminated
union.

```sh
npx tsx analyze.ts --in ./frames.jsonl --out ./PROTOCOL.md
```

Flags: `--in` (default `./frames.jsonl`), `--out` (default `./PROTOCOL.md`),
`--maxExamplePayloadChars`, `--maxExampleValueChars`. The analyzer detects
JSON / SignalR (hub-protocol shape or 0x1E delimiter) / "non-JSON" and
labels the connection accordingly. Payload shapes that vary by a sub-tag
(notably `PID=7` which has a `TYPE=0` per-lap variant and a `TYPE=1`
class-progression variant) are emitted as separate sections with separate
TypeScript interfaces.
