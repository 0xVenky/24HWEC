# Dashboard ↔ Upstream live-timing comparison

## 1. Snapshot metadata

All three observations were taken in a single Playwright run with both tabs
open simultaneously (see [snapshot-compare.ts](snapshot-compare.ts)), so the
A→B→C window is well under the 1–2 s drift threshold.

| Obs | What | Captured at | Δ from A |
| --- | --- | --- | --- |
| **A** | Last `PID=0` frame on the upstream tab's WS | `2026-05-14T19:17:33.220Z` | — |
| **B** | Upstream DOM (`livetiming.azurewebsites.net/event=50?config=w3`) | `2026-05-14T19:17:33.458Z` | +238 ms |
| **C** | Dashboard DOM (`http://localhost:5173/`) | `2026-05-14T19:17:33.515Z` | +295 ms |

- Frame meta: `PID=0`, `RECNUM=0`, `HEAT="Qualifying 2"`, `TRACKSTATE=0`,
  `NROFINTERMEDIATETIMES=8`, `RESULT.length=161`.
- 17 PID=0 frames seen during the 18 s wait (~1 Hz refresh).
- Raw artefacts: [compare-snapshot.json](compare-snapshot.json) (~810 KB) and
  [diff-report.txt](diff-report.txt).

## 2. Matched OK

**19 of 25 rows match across all 12 audited fields**; the remaining 6 only
differ on the `S9TIME` column (see §3). Field-by-field check on top-25:
`POSITION`, `CLASSNAME`, `STNR`, `NAME` (with the `formatDriverName`
transform), `CAR`, `TEAM`, `LAPS`, `LASTLAPTIME`, `FASTESTLAP`, `GAP` (with
`fmtGap` `+` prefix), `INT`, and `S1TIME`–`S8TIME` all match the WS values
exactly.

## 3. Dashboard ↔ WS diffs

### Bug 1 — `S9TIME` column is never rendered

[dashboard/src/components/TimingTable.tsx:101-104](dashboard/src/components/TimingTable.tsx#L101) computes
`sectorCount` as `NROFINTERMEDIATETIMES` (=`"8"` in every frame), so the table
header only emits `S1`…`S8`. But the protocol carries a 9th sector
(`S1L`…`S9L` are all populated track-segment lengths, and every `RESULT[i]`
entry has an `S9TIME` field).

Across the full 161-car grid:

| `S9TIME` content | Count |
| --- | --- |
| Empty | 102 |
| `"PIT"` (sentinel for in-pit) | 54 |
| Real lap-time string (e.g. `"32.393"`) | 5 |

Within the top 25 alone the dashboard hides:

| Pos | `STNR` | `S9TIME` (WS) | Dashboard |
| --- | --- | --- | --- |
| 4 | 99 (Hesse, BMW M4 GT3 EVO) | `32.393` | column missing |
| 7 | 77 (Frijns) | `PIT` | column missing |
| 14 | 44 (Bachler) | `PIT` | column missing |
| 18 | 4 (Goroyan) | `PIT` | column missing |
| 19 | 32 | `PIT` | column missing |
| 20 | 54 | `PIT` | column missing |

The upstream UI does render an `S9 time` column (cell index 31 of its
`tc tc-sector9Time` column) and shows `"32.393"` for P4 and `"PIT"` for the
others. **Fix:** in [dashboard/src/components/TimingTable.tsx:101-104](dashboard/src/components/TimingTable.tsx#L101)
either render `Number(NROFINTERMEDIATETIMES) + 1` columns, or hard-code 9
(the protocol's actual sector count — see the `S1L`…`S9L` length tuple at
[PROTOCOL.md:159-167](PROTOCOL.md#L159)).

### Bug 2 — `Pit` badge mis-detects pit state

[dashboard/src/components/TimingTable.tsx:240](dashboard/src/components/TimingTable.tsx#L240)
flags a car as "in pit" iff `LASTINTERMEDIATENUMBER === "0" && LAPS !== "0"`.
But the actual `LASTINTERMEDIATENUMBER` encoding seen in this frame is:

| LIN | Count | Upstream "State" column |
| --- | --- | --- |
| `1`…`9` | 96 | `I1`…`I9` (running, last passed intermediate) |
| `10` | 2 | `F` (just crossed line) |
| `16` | 6 | `AP` (approaching pit) |
| `20` | **53** | `PE` (parked / pit) |
| `0` | 4 | (none in top 25; this is the assumed "in pit" code) |

Five of the top-25 cars (P7, P14, P18, P19, P20) are marked `PE` upstream but
get no badge in the dashboard. **Fix:** extend the predicate to treat
`LASTINTERMEDIATENUMBER === "20"` (and likely `"16"` for "approach pit") as
in-pit, or trigger on `S9TIME === "PIT"`.

### Bug 3 (minor) — `PRO` field is binary-rendered

[dashboard/src/components/TimingTable.tsx:247-251](dashboard/src/components/TimingTable.tsx#L247) only emits a
badge when `e.PRO === "PRO"`. Observed values include `"PRO"`, `"PROAM"`, and
`"AM"` (e.g. STNR 48 at P16 has `PRO="PROAM"`); upstream renders the literal
in its own column. The dashboard silently drops PROAM/AM, which loses
information. Cheap fix: render the literal in a small chip when non-empty
rather than gating on exact `"PRO"`.

## 4. Upstream ↔ WS diffs

None on the audited fields. `POSITION`, `LAPS`, `LASTLAPTIME`, `FASTESTLAP`,
`GAP`, `NAME` (surname), `CAR`, `CLASSNAME`, `CLASSRANK`, and `S1TIME`–
`S9TIME` are byte-for-byte identical to the WS frame across all 25 rows.

## 5. Likely drift

None observed in this snapshot — the A→C window of ~295 ms was tight enough
that no sector or lap rolled over in between. If a longer wait window were
used I'd expect drift to appear first on the current-sector cell (the one
matching `LASTINTERMEDIATENUMBER`) and on `LASTLAPTIME` for cars finishing
laps in the gap.

## 6. Recommendations

1. **[Highest impact]** Render the 9th sector column. Concrete change at
   [dashboard/src/components/TimingTable.tsx:101-104](dashboard/src/components/TimingTable.tsx#L101):

   ```ts
   const sectorCount = useMemo(() => {
     const n = Number.parseInt(snapshot.NROFINTERMEDIATETIMES, 10);
     // NROFINTERMEDIATETIMES counts intermediates; the trailing run-in to the
     // start/finish line is one more sector. Both protocol (S1L..S9L) and
     // upstream UI use 9.
     return Number.isFinite(n) && n > 0 ? n + 1 : 9;
   }, [snapshot.NROFINTERMEDIATETIMES]);
   ```

   The `SectorCell` component already handles the `"PIT"` literal correctly —
   it falls through `parseTimeMs` to `"normal"` tone and renders the raw
   string.

2. Broaden the in-pit detector at [dashboard/src/components/TimingTable.tsx:240](dashboard/src/components/TimingTable.tsx#L240):

   ```ts
   const isInPit =
     (e.LASTINTERMEDIATENUMBER === "0" ||
      e.LASTINTERMEDIATENUMBER === "20") &&
     e.LAPS !== "0";
   ```

   53 cars in this snapshot are mis-classified; this is the dominant pit
   encoding in the protocol.

3. Replace the binary `PRO`-badge gate at [dashboard/src/components/TimingTable.tsx:247-251](dashboard/src/components/TimingTable.tsx#L247)
   with `e.PRO ? <span>{e.PRO}</span> : null` so `PROAM`/`AM` show up too.

4. Out of audit scope but worth a follow-up: the dashboard sorts strictly by
   overall `POSITION`, while the upstream offers class-grouped views; this is
   a deliberate dashboard UX choice, not a fidelity bug.
