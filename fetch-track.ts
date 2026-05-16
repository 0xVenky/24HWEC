// Fetch the Nürburgring raceway geometry from OpenStreetMap and emit an SVG
// path module compatible with the dashboard's TrackMap component.
//
//   npx tsx fetch-track.ts
//
// What it does:
//   1. Queries Overpass for every way tagged `highway=raceway` inside a
//      bounding box around the Nürburgring complex.
//   2. Greedy-stitches the ways into the longest connected polyline by
//      matching endpoint coordinates (the OSM data isn't always ordered in
//      race direction, and pit lanes show up as dead-end branches; we keep
//      the biggest cycle).
//   3. Projects lat/lon → SVG (x, y) with a cos-latitude correction so the
//      aspect ratio stays right at 50°N.
//   4. Writes `dashboard/src/lib/nordschleife.ts` with the same exports the
//      stylised path used: NURBURGRING_PATH, NURBURGRING_VIEWBOX,
//      NURBURGRING_START.
//
// Flags:
//   --out <path>     Where to write the generated module
//   --bbox a,b,c,d   south,west,north,east lat/lon bounding box
//   --width <px>     SVG viewBox width  (height auto-scales to keep aspect)
//   --pad <px>       Padding inside the viewBox
//   --print-only     Don't write a file, just dump path + summary to stdout

import { writeFileSync } from "node:fs";

interface OverpassWay {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry: Array<{ lat: number; lon: number }>;
}
type LatLon = { lat: number; lon: number };

interface Args {
  out: string;
  bbox: [number, number, number, number]; // S, W, N, E
  width: number;
  pad: number;
  printOnly: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    out: "dashboard/src/lib/nordschleife.ts",
    bbox: [50.31, 6.92, 50.4, 6.99],
    width: 800,
    pad: 20,
    printOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out.out = argv[++i]!;
    else if (a === "--width") out.width = Number(argv[++i]);
    else if (a === "--pad") out.pad = Number(argv[++i]);
    else if (a === "--print-only") out.printOnly = true;
    else if (a === "--bbox") {
      const parts = argv[++i]!.split(",").map(Number);
      if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
        throw new Error("--bbox needs four comma-separated numbers (S,W,N,E)");
      }
      out.bbox = parts as [number, number, number, number];
    }
  }
  return out;
}

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

async function fetchWays(bbox: [number, number, number, number]): Promise<OverpassWay[]> {
  const [s, w, n, e] = bbox;
  const query = `
[out:json][timeout:30];
(
  way["highway"="raceway"](${s},${w},${n},${e});
);
out geom;
`;
  const qs = "?data=" + encodeURIComponent(query);
  let lastErr: unknown = null;
  for (const url of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url + qs, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "fastn24-fetch-track/0.1 (https://github.com/local)",
          },
        });
        if (res.status === 429) {
          const wait = Math.min(20, 5 * attempt);
          console.warn(`  ${new URL(url).host}: 429, retrying in ${wait}s`);
          await new Promise((r) => setTimeout(r, wait * 1000));
          continue;
        }
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          lastErr = new Error(`${url} → ${res.status}: ${text.slice(0, 120)}`);
          console.warn(`  (skipping ${url} — ${res.status})`);
          break;
        }
        const data = (await res.json()) as { elements: OverpassWay[] };
        const ways = data.elements.filter(
          (el) => el.type === "way" && Array.isArray(el.geometry),
        );
        console.log(`  fetched ${ways.length} ways from ${new URL(url).host}`);
        if (ways.length === 0) {
          // This mirror may have stale data; try the next endpoint.
          lastErr = new Error(`${url} returned 0 ways`);
          break;
        }
        return ways;
      } catch (err) {
        lastErr = err;
        console.warn(`  (skipping ${url} — ${(err as Error).message})`);
        break;
      }
    }
  }
  throw lastErr ?? new Error("all Overpass endpoints failed");
}

// Drop pit lanes (`Boxengasse`), the rallycross circuit, and the standalone
// "Anbindung zur Sprintstrecke" stub (an ambiguous connector that wires the
// GP loop back into itself). What remains is everything that's actually
// driven during the 24h layout.
function dropOffRouteWays(ways: OverpassWay[]): OverpassWay[] {
  return ways.filter((w) => {
    const name = (w.tags?.name ?? "").toLowerCase();
    if (name.includes("boxen")) return false;
    if (name.includes("pit lane")) return false;
    if (name.includes("rallycross")) return false;
    return true;
  });
}

// The modern "Nürburgring Sprintstrecke" ways form a self-closing GP loop in
// OSM, which traps the greedy stitcher. We pull them into a separate pool so
// the Nordschleife stitch can walk through the named GP corners (Michael-
// Schumacher-S, Sabine-Schmitz-Kurve, etc.) — those corners are the bridge
// between the GP side and the Nordschleife on the 24h race route, so they
// belong with the Nordschleife chain.
function isGpWay(w: OverpassWay): boolean {
  const name = w.tags?.name ?? "";
  return /sprintstrecke/i.test(name);
}

// --- stitching -----------------------------------------------------------

// Distance between two lat/lon points in metres (haversine is overkill at this
// scale; equirectangular is fine).
function distM(a: LatLon, b: LatLon): number {
  const dLat = (a.lat - b.lat) * 111_320;
  const cosLat = Math.cos((a.lat * Math.PI) / 180);
  const dLon = (a.lon - b.lon) * 111_320 * cosLat;
  return Math.hypot(dLat, dLon);
}

// Greedy stitching with a distance tolerance, because OSM ways at the
// Nürburgring don't always have exactly-matching endpoints across mappers —
// connector ways and named corners can be a metre or two apart at the join.
// Pick the longest way as a seed and repeatedly attach any unused way whose
// endpoint is within `tol` metres of the current chain's head or tail.
const STITCH_TOLERANCE_M = 50;

function stitchLongest(ways: OverpassWay[]): {
  chain: LatLon[];
  usedIds: number[];
  pickedSeed: OverpassWay;
  usedNames: string[];
} {
  if (ways.length === 0) throw new Error("no ways to stitch");
  const sorted = [...ways].sort((a, b) => b.geometry.length - a.geometry.length);
  const seed = sorted[0];
  const used = new Set<number>([seed.id]);
  const usedNames: string[] = [seed.tags?.name ?? `way ${seed.id}`];
  let chain = seed.geometry.slice();
  let extended = true;

  while (extended) {
    extended = false;
    const head = chain[0];
    const tail = chain[chain.length - 1];
    // Find the candidate with the closest endpoint-to-head or endpoint-to-tail
    // distance under tolerance — closest first so we prefer tight joins.
    let best: {
      way: OverpassWay;
      attach: "tailFwd" | "tailRev" | "headFwd" | "headRev";
      dist: number;
    } | null = null;
    for (const w of sorted) {
      if (used.has(w.id)) continue;
      const wHead = w.geometry[0];
      const wTail = w.geometry[w.geometry.length - 1];
      const candidates: { attach: "tailFwd" | "tailRev" | "headFwd" | "headRev"; d: number }[] = [
        { attach: "tailFwd", d: distM(tail, wHead) },
        { attach: "tailRev", d: distM(tail, wTail) },
        { attach: "headFwd", d: distM(head, wTail) },
        { attach: "headRev", d: distM(head, wHead) },
      ];
      for (const c of candidates) {
        if (c.d < STITCH_TOLERANCE_M && (best == null || c.d < best.dist)) {
          best = { way: w, attach: c.attach, dist: c.d };
        }
      }
    }
    if (!best) break;

    const w = best.way;
    if (best.attach === "tailFwd") {
      chain = chain.concat(w.geometry.slice(1));
    } else if (best.attach === "tailRev") {
      chain = chain.concat(w.geometry.slice(0, -1).reverse());
    } else if (best.attach === "headFwd") {
      chain = w.geometry.slice(0, -1).concat(chain);
    } else {
      chain = w.geometry.slice(1).reverse().concat(chain);
    }
    used.add(w.id);
    usedNames.push(w.tags?.name ?? `way ${w.id}`);
    extended = true;
  }
  return { chain, usedIds: [...used], pickedSeed: seed, usedNames };
}

// --- projection ---------------------------------------------------------

interface Projection {
  width: number;
  height: number;
  project: (p: LatLon) => { x: number; y: number };
}

function makeProjection(points: LatLon[], width: number, pad: number): Projection {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  const centerLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  // metres per degree
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * cosLat;
  const widthM = (maxLon - minLon) * mPerDegLon;
  const heightM = (maxLat - minLat) * mPerDegLat;

  const usableW = width - pad * 2;
  const scale = usableW / widthM;
  const usableH = heightM * scale;
  const height = Math.round(usableH + pad * 2);

  function project(p: LatLon) {
    const xM = (p.lon - minLon) * mPerDegLon;
    const yM = (p.lat - minLat) * mPerDegLat;
    return {
      x: pad + xM * scale,
      // flip Y so north is up
      y: height - pad - yM * scale,
    };
  }
  return { width, height, project };
}

// --- output -------------------------------------------------------------

function chainToPath(
  chain: LatLon[],
  proj: Projection,
  forceClose = false,
): { d: string; start: { x: number; y: number }; closed: boolean } {
  if (chain.length === 0) throw new Error("empty chain");
  // Detect closure within 5 m — the loop start/end won't match to the cm.
  const closed = forceClose || distM(chain[0], chain[chain.length - 1]) < 5;
  const pts = chain.map(proj.project);
  const parts: string[] = [`M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`];
  for (let i = 1; i < pts.length; i++) {
    parts.push(`L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`);
  }
  if (closed) parts.push("Z");
  return { d: parts.join(" "), start: pts[0], closed };
}

function emitModule(
  d: string,
  start: { x: number; y: number },
  viewBoxW: number,
  viewBoxH: number,
  meta: { ways: number; usedWays: number; bbox: [number, number, number, number]; seedId: number },
): string {
  return `// AUTO-GENERATED by fetch-track.ts — do not hand-edit.
//
// Source: OpenStreetMap (highway=raceway in bbox ${meta.bbox.join(", ")})
// Stitched from ${meta.usedWays}/${meta.ways} ways. Seed way id: ${meta.seedId}.
// Map data © OpenStreetMap contributors — see https://www.openstreetmap.org/copyright

export const NURBURGRING_VIEWBOX = { width: ${viewBoxW}, height: ${viewBoxH} } as const;

export const NURBURGRING_PATH = ${JSON.stringify(d)};

export const NURBURGRING_START = { x: ${start.x.toFixed(2)}, y: ${start.y.toFixed(2)} } as const;
`;
}

// --- main ---------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Fetching raceway ways in bbox ${args.bbox.join(",")} …`);
  const wayRaw = await fetchWays(args.bbox);
  const ways = dropOffRouteWays(wayRaw);
  console.log(`Got ${wayRaw.length} ways, ${ways.length} after dropping pit/rallycross.`);
  if (ways.length === 0) {
    throw new Error("Overpass returned no usable ways for this bbox.");
  }

  // Partition. The Nordschleife side keeps everything that isn't tagged with
  // a GP-Strecke corner name (connectors stay on the Nordschleife side so the
  // long Nordschleife loop has enough material to stitch).
  const gpWays = ways.filter(isGpWay);
  const nsWays = ways.filter((w) => !isGpWay(w));
  console.log(`Partition: ${gpWays.length} GP ways, ${nsWays.length} Nordschleife/route ways.`);

  const ns = stitchLongest(nsWays);
  console.log(
    `Nordschleife: stitched ${ns.usedIds.length}/${nsWays.length} ways → ${ns.chain.length} points`,
  );
  for (const n of ns.usedNames) console.log("    NS  " + n);

  const gp = stitchLongest(gpWays);
  console.log(
    `GP-Strecke:  stitched ${gp.usedIds.length}/${gpWays.length} ways → ${gp.chain.length} points`,
  );
  for (const n of gp.usedNames) console.log("    GP  " + n);

  // One projection across both chains so the geographic scale is consistent.
  const allPoints = [...ns.chain, ...gp.chain];
  const proj = makeProjection(allPoints, args.width, args.pad);
  const nsPath = chainToPath(ns.chain, proj, /* forceClose */ true);
  const gpPath = chainToPath(gp.chain, proj, /* forceClose */ true);

  // GP first in the path string so cars in sector 1 (Start/Finish straight,
  // distance 0) land near the actual S/F line at the start of the GP loop.
  const d = `${gpPath.d} ${nsPath.d}`;
  const start = gpPath.start;
  console.log(
    `viewBox: 0 0 ${proj.width} ${proj.height}  ·  start at (${start.x.toFixed(1)}, ${start.y.toFixed(1)})  ·  ${ns.usedIds.length + gp.usedIds.length}/${ways.length} ways used`,
  );
  if (args.printOnly) {
    console.log("\n---\n" + d + "\n---");
    return;
  }
  const moduleSrc = emitModule(d, start, proj.width, proj.height, {
    ways: ways.length,
    usedWays: ns.usedIds.length + gp.usedIds.length,
    bbox: args.bbox,
    seedId: ns.pickedSeed.id,
  });
  writeFileSync(args.out, moduleSrc, "utf-8");
  console.log(`Wrote ${args.out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
