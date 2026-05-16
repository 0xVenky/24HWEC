import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const { values } = parseArgs({
  options: {
    in: { type: "string", default: "./frames.jsonl" },
    out: { type: "string", default: "./PROTOCOL.md" },
    maxExamplePayloadChars: { type: "string", default: "600" },
    maxExampleValueChars: { type: "string", default: "100" },
  },
  strict: true,
});

const inPath = path.resolve(values.in!);
const outPath = path.resolve(values.out!);
const MAX_PAYLOAD_EXAMPLE = Number.parseInt(values.maxExamplePayloadChars!, 10);
const MAX_VALUE_EXAMPLE = Number.parseInt(values.maxExampleValueChars!, 10);

if (!fs.existsSync(inPath)) {
  console.error(`[analyze] input file not found: ${inPath}`);
  const fallback = path.resolve("./smoke.jsonl");
  if (fs.existsSync(fallback)) {
    console.error(`[analyze] hint: try --in ${fallback}`);
  }
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Schema inference
// ---------------------------------------------------------------------------
type TypeTag = "string" | "number" | "boolean" | "null" | "object" | "array";

function typeOf(v: unknown): TypeTag {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  if (t === "string" || t === "number" || t === "boolean" || t === "object") return t;
  return "null";
}

class Schema {
  totalObservations = 0;
  typeCounts: Map<TypeTag, number> = new Map();
  examples: Map<TypeTag, unknown> = new Map();
  // Object case
  fields: Map<string, Schema> = new Map();
  fieldPresence: Map<string, number> = new Map();
  // Array case
  elementSchema: Schema | null = null;
  arrayLengths: number[] = [];
  positionalSchemas: Schema[] = [];
  // For strings, also note whether they look numeric (helps flag stringified numbers)
  stringNumericCount = 0;
  stringEmptyCount = 0;
  stringBoolishCount = 0;

  observe(v: unknown): void {
    this.totalObservations++;
    const t = typeOf(v);
    this.typeCounts.set(t, (this.typeCounts.get(t) ?? 0) + 1);
    if (!this.examples.has(t)) this.examples.set(t, v);

    if (t === "string") {
      const s = v as string;
      if (s === "") this.stringEmptyCount++;
      else if (/^-?\d+(\.\d+)?$/.test(s)) this.stringNumericCount++;
      else if (s === "true" || s === "false") this.stringBoolishCount++;
    } else if (t === "object") {
      const obj = v as Record<string, unknown>;
      for (const [k, val] of Object.entries(obj)) {
        if (!this.fields.has(k)) this.fields.set(k, new Schema());
        this.fields.get(k)!.observe(val);
        this.fieldPresence.set(k, (this.fieldPresence.get(k) ?? 0) + 1);
      }
    } else if (t === "array") {
      const arr = v as unknown[];
      this.arrayLengths.push(arr.length);
      if (!this.elementSchema) this.elementSchema = new Schema();
      for (let i = 0; i < arr.length; i++) {
        this.elementSchema.observe(arr[i]);
        if (this.positionalSchemas.length <= i) this.positionalSchemas.push(new Schema());
        this.positionalSchemas[i].observe(arr[i]);
      }
    }
  }

  // Returns true if observed array lengths are all the same and >= 1.
  hasFixedArrayLength(): boolean {
    if (this.arrayLengths.length === 0) return false;
    const first = this.arrayLengths[0];
    return first >= 1 && this.arrayLengths.every((n) => n === first);
  }

  // Tuple-like: arrays of fixed length where each position is a single primitive type,
  // and at least two positions have different types.
  isTupleLike(): boolean {
    if (!this.hasFixedArrayLength()) return false;
    if (this.positionalSchemas.length < 2) return false;
    const positionTypes = this.positionalSchemas.map((p) => [...p.typeCounts.keys()]);
    if (!positionTypes.every((tags) => tags.length === 1)) return false;
    const allPrimitive = positionTypes.every((tags) =>
      ["string", "number", "boolean", "null"].includes(tags[0]),
    );
    if (!allPrimitive) return false;
    const distinct = new Set(positionTypes.map((tags) => tags[0]));
    return distinct.size > 1;
  }
}

// ---------------------------------------------------------------------------
// Read and group
// ---------------------------------------------------------------------------
type Conn = {
  requestId: string;
  url?: string;
  source?: string;
  handshakeReqHeaders?: Record<string, string>;
  handshakeRespHeaders?: Record<string, string>;
  handshakeStatus?: number;
  handshakeStatusText?: string;
  closedAt?: string;
  createdAt?: string;
  framesSent: number;
  framesReceived: number;
  textFrames: number;
  binaryFrames: number;
  controlFrames: number;
  // Per (direction, PID[, variantKey]) -> schema
  groups: Map<string, {
    direction: "sent" | "received";
    pid: string;
    variant?: string; // e.g. "TYPE=0" — used for PIDs whose payload shape varies
    schema: Schema;
    count: number;
    samplePayload: string;
  }>;
  rawSamples: { direction: "sent" | "received"; payload: string }[];
};

const conns: Map<string, Conn> = new Map();
function getConn(id: string): Conn {
  let c = conns.get(id);
  if (!c) {
    c = {
      requestId: id,
      framesSent: 0,
      framesReceived: 0,
      textFrames: 0,
      binaryFrames: 0,
      controlFrames: 0,
      groups: new Map(),
      rawSamples: [],
    };
    conns.set(id, c);
  }
  return c;
}

let firstFrameTs: string | null = null;
let lastFrameTs: string | null = null;
let totalLines = 0;
let parseErrors = 0;
const errorEvents: Array<{ ts: string; requestId: string; errorMessage: string }> = [];

const raw = fs.readFileSync(inPath, "utf8");
const lines = raw.split("\n").filter((l) => l.length > 0);
for (const line of lines) {
  totalLines++;
  let ev: any;
  try {
    ev = JSON.parse(line);
  } catch {
    parseErrors++;
    continue;
  }
  const c = getConn(ev.requestId);

  switch (ev.kind) {
    case "webSocketCreated":
      c.url = ev.url;
      c.createdAt = ev.ts;
      if (typeof ev.source === "string") c.source = ev.source;
      break;
    case "webSocketWillSendHandshakeRequest":
      c.handshakeReqHeaders = ev.headers;
      break;
    case "webSocketHandshakeResponseReceived":
      c.handshakeRespHeaders = ev.headers;
      c.handshakeStatus = ev.status;
      c.handshakeStatusText = ev.statusText;
      break;
    case "webSocketClosed":
      c.closedAt = ev.ts;
      break;
    case "webSocketFrameError":
      errorEvents.push({ ts: ev.ts, requestId: ev.requestId, errorMessage: ev.errorMessage });
      break;
    case "webSocketFrameSent":
    case "webSocketFrameReceived": {
      const direction: "sent" | "received" = ev.kind === "webSocketFrameSent" ? "sent" : "received";
      if (direction === "sent") c.framesSent++;
      else c.framesReceived++;
      const opcode = ev.opcode;
      if (opcode === 1) c.textFrames++;
      else if (opcode === 2) c.binaryFrames++;
      else c.controlFrames++;
      if (!firstFrameTs) firstFrameTs = ev.ts;
      lastFrameTs = ev.ts;
      // Track source tag from capture.ts (e.g. "lapHistory" for the parallel
      // backfill WS) so we can label the connection summary.
      if (typeof ev.source === "string" && !c.source) c.source = ev.source;
      // Try to parse as JSON
      const payload = ev.payloadData ?? "";
      const isBase64 = ev.payloadIsBase64 === true;
      let parsed: unknown = undefined;
      let pid = "(non-JSON)";
      let variant: string | undefined;
      if (!isBase64) {
        try {
          parsed = JSON.parse(payload);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const p = (parsed as Record<string, unknown>).PID;
            if (typeof p === "string" || typeof p === "number") pid = String(p);
            else pid = "(no PID)";
            // PID=7 splits into TYPE=0 (per-lap events) and TYPE=1 (class
            // progression). Different DATA element shapes — keep them separate.
            if (pid === "7") {
              const t = (parsed as Record<string, unknown>).TYPE;
              if (typeof t === "number" || typeof t === "string") variant = `TYPE=${t}`;
            }
          } else {
            pid = "(non-object)";
          }
        } catch {
          pid = "(non-JSON)";
        }
      } else {
        pid = "(binary)";
      }
      const key = variant
        ? `${direction}::${pid}::${variant}`
        : `${direction}::${pid}`;
      let group = c.groups.get(key);
      if (!group) {
        group = {
          direction,
          pid,
          variant,
          schema: new Schema(),
          count: 0,
          samplePayload: payload,
        };
        c.groups.set(key, group);
      }
      group.count++;
      if (parsed !== undefined) group.schema.observe(parsed);
      if (c.rawSamples.length < 6) c.rawSamples.push({ direction, payload });
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------
function detectFormatForConn(c: Conn): string {
  // If any frame parsed to a JSON object containing PID, call it custom JSON envelope.
  let jsonObjCount = 0;
  let signalrLooking = 0;
  let nonJsonCount = 0;
  for (const g of c.groups.values()) {
    if (g.pid === "(non-JSON)") nonJsonCount += g.count;
    else if (g.pid === "(binary)") nonJsonCount += g.count;
    else jsonObjCount += g.count;
    // SignalR hub-protocol envelope: {"type": <int 1-7>, "target", "arguments", ...}
    // SignalR also commonly delimits frames with 0x1E.
    // Quick check on the sample payload:
    if (g.samplePayload && g.samplePayload.includes("")) signalrLooking += g.count;
    try {
      const obj: any = JSON.parse(g.samplePayload);
      if (obj && typeof obj === "object" && "type" in obj && "target" in obj) signalrLooking += g.count;
    } catch {
      /* ignore */
    }
  }
  const total = jsonObjCount + nonJsonCount;
  if (total === 0) return "no frames";
  if (signalrLooking > 0) return "SignalR hub-protocol envelopes";
  if (jsonObjCount / total > 0.95) return "Custom JSON envelopes (PID-discriminated)";
  if (jsonObjCount > 0) return "Mixed (mostly JSON)";
  return "Unknown / non-JSON";
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------
function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `…(+${s.length - max} chars)`;
}

function quoteCell(s: string): string {
  // Escape pipes and newlines for Markdown tables
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/\r/g, "");
}

function exampleToCell(v: unknown): string {
  let s: string;
  try {
    s = JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return "`" + quoteCell(truncate(s, MAX_VALUE_EXAMPLE)) + "`";
}

function typeUnionString(schema: Schema): string {
  const tags = [...schema.typeCounts.keys()];
  if (tags.length === 1) return tags[0];
  return tags.join(" \\| ");
}

function describeFieldType(schema: Schema): string {
  const tags = [...schema.typeCounts.keys()];
  // Pure array case
  if (tags.length === 1 && tags[0] === "array" && schema.elementSchema) {
    if (schema.isTupleLike()) {
      const tupleTypes = schema.positionalSchemas.map((p) => [...p.typeCounts.keys()][0]);
      return `[${tupleTypes.join(", ")}]`;
    }
    // Recurse into the element type so Array<Array<primitives>> renders as
    // Array<[t1, t2, ...]> when the inner arrays are tuple-like.
    return `Array<${describeFieldType(schema.elementSchema)}>`;
  }
  // Pure object case
  if (tags.length === 1 && tags[0] === "object") return "Object";
  return typeUnionString(schema);
}

function emitFieldTable(schema: Schema, parentObservations: number): string[] {
  const out: string[] = [];
  out.push("| Field | Type | Presence | Example | Notes |");
  out.push("| --- | --- | --- | --- | --- |");
  const fields = [...schema.fields.entries()];
  for (const [name, sub] of fields) {
    const present = schema.fieldPresence.get(name) ?? 0;
    const presence = `${present}/${parentObservations}`;
    const example = sub.examples.get([...sub.typeCounts.keys()][0]);
    const type = describeFieldType(sub);
    const notes: string[] = [];
    if (sub.typeCounts.get("string") && sub.stringNumericCount === sub.typeCounts.get("string")) {
      notes.push("looks numeric (stringified)");
    } else if (sub.typeCounts.get("string") && sub.stringNumericCount > 0) {
      notes.push("mostly numeric (stringified) or empty");
    }
    if (sub.stringEmptyCount > 0) notes.push(`${sub.stringEmptyCount}× empty string`);
    if (sub.typeCounts.size > 1) notes.push("union: " + [...sub.typeCounts.keys()].join("/"));
    if (present < parentObservations) notes.push("not always present");
    out.push(
      `| \`${name}\` | ${type} | ${presence} | ${exampleToCell(example)} | ${notes.join("; ")} |`,
    );
  }
  return out;
}

function generateTsTypeForField(
  schema: Schema,
  ctx: { ifaces: string[]; namePrefix: string; fieldName: string },
): string {
  const tags = [...schema.typeCounts.keys()];
  // Simple primitive(s)
  const primitiveTagOnly = tags.every((t) => ["string", "number", "boolean", "null"].includes(t));
  if (primitiveTagOnly && tags.length > 0) {
    const tsTags = tags.map((t) => (t === "null" ? "null" : t));
    return tsTags.join(" | ");
  }
  // Pure object
  if (tags.length === 1 && tags[0] === "object") {
    const ifaceName = `${ctx.namePrefix}_${ctx.fieldName}`;
    ctx.ifaces.push(emitInterface(ifaceName, schema, ctx.ifaces));
    return ifaceName;
  }
  // Pure array
  if (tags.length === 1 && tags[0] === "array" && schema.elementSchema) {
    if (schema.isTupleLike()) {
      const tupleTypes = schema.positionalSchemas.map((p) => {
        const tag = [...p.typeCounts.keys()][0];
        return tag === "null" ? "null" : tag;
      });
      return `[${tupleTypes.join(", ")}]`;
    }
    const elemTs = generateTsTypeForField(schema.elementSchema, {
      ifaces: ctx.ifaces,
      namePrefix: ctx.namePrefix,
      fieldName: `${ctx.fieldName}Item`,
    });
    return `Array<${elemTs}>`;
  }
  // Union: keep simple
  return tags.map((t) => (t === "null" ? "null" : t === "array" ? "unknown[]" : t === "object" ? "object" : t)).join(" | ");
}

function emitInterface(name: string, schema: Schema, ifaces: string[]): string {
  const fieldLines: string[] = [];
  for (const [fname, fsub] of schema.fields.entries()) {
    const presence = schema.fieldPresence.get(fname) ?? 0;
    const optional = presence < schema.totalObservations ? "?" : "";
    const ts = generateTsTypeForField(fsub, { ifaces, namePrefix: name, fieldName: fname });
    // Sanitize field name for TS — keys with non-identifier chars need quotes.
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(fname) ? fname : `"${fname}"`;
    fieldLines.push(`  ${key}${optional}: ${ts};`);
  }
  return `export interface ${name} {\n${fieldLines.join("\n")}\n}`;
}

// ---------------------------------------------------------------------------
// Emit Markdown
// ---------------------------------------------------------------------------
const sections: string[] = [];

sections.push(`# Live timing WebSocket protocol — capture analysis`);
sections.push("");
sections.push(
  `Generated by \`analyze.ts\` from \`${path.relative(process.cwd(), inPath) || inPath}\`.`,
);
sections.push("");
sections.push(`## Capture summary`);
sections.push("");
sections.push(`- **Source:** \`${inPath}\``);
sections.push(`- **Total CDP events:** ${totalLines}` + (parseErrors > 0 ? ` (parse errors: ${parseErrors})` : ""));
sections.push(`- **First frame:** ${firstFrameTs ?? "—"}`);
sections.push(`- **Last frame:** ${lastFrameTs ?? "—"}`);
sections.push(`- **Connections:** ${conns.size}`);
if (errorEvents.length) {
  sections.push(`- **Frame errors:** ${errorEvents.length}`);
} else {
  sections.push(`- **Frame errors:** none`);
}
sections.push("");

let connIndex = 0;
const allInterfaces: string[] = [];
const messageTypeNames: {
  pid: string;
  ifaceName: string;
  direction: "sent" | "received";
  variant?: string;
}[] = [];

for (const [reqId, c] of conns) {
  connIndex++;
  const sourceLabel = c.source ? ` · _${c.source}_` : "";
  sections.push(`## Connection ${connIndex} — \`${reqId}\`${sourceLabel}`);
  sections.push("");
  sections.push(`- **URL:** \`${c.url ?? "?"}\``);
  if (c.source) sections.push(`- **Source tag:** \`${c.source}\``);
  if (c.handshakeStatus) {
    sections.push(`- **Handshake status:** ${c.handshakeStatus} ${c.handshakeStatusText ?? ""}`);
  }
  if (c.handshakeReqHeaders) {
    const interesting = ["Origin", "User-Agent", "Sec-WebSocket-Extensions", "Sec-WebSocket-Protocol"];
    const picked: string[] = [];
    for (const k of interesting) {
      const v = c.handshakeReqHeaders[k];
      if (v) picked.push(`  - \`${k}: ${truncate(v, 100)}\``);
    }
    if (picked.length) {
      sections.push(`- **Notable request headers:**`);
      sections.push(...picked);
    }
  }
  if (c.handshakeRespHeaders) {
    const interesting = ["Server", "Sec-WebSocket-Protocol", "Sec-WebSocket-Extensions"];
    const picked: string[] = [];
    for (const k of interesting) {
      const v = c.handshakeRespHeaders[k];
      if (v) picked.push(`  - \`${k}: ${truncate(v, 100)}\``);
    }
    if (picked.length) {
      sections.push(`- **Notable response headers:**`);
      sections.push(...picked);
    }
  }
  sections.push(`- **Frames sent:** ${c.framesSent}`);
  sections.push(`- **Frames received:** ${c.framesReceived}`);
  sections.push(`- **Text / binary / control:** ${c.textFrames} / ${c.binaryFrames} / ${c.controlFrames}`);
  sections.push(`- **Detected format:** ${detectFormatForConn(c)}`);
  sections.push(`- **Closed at:** ${c.closedAt ?? "still open at capture end"}`);
  sections.push("");

  // PID distribution
  sections.push("### Message-type distribution");
  sections.push("");
  sections.push("| Direction | PID | Variant | Count |");
  sections.push("| --- | --- | --- | --- |");
  for (const g of c.groups.values()) {
    sections.push(`| ${g.direction} | \`${g.pid}\` | ${g.variant ?? "—"} | ${g.count} |`);
  }
  sections.push("");

  // Per group, emit a section
  for (const g of c.groups.values()) {
    const pidLabel = g.pid;
    const variantLabel = g.variant ? ` · ${g.variant}` : "";
    sections.push(`### ${g.direction === "sent" ? "→ Client→Server" : "← Server→Client"} · PID = \`${pidLabel}\`${variantLabel} (${g.count} frames)`);
    sections.push("");
    sections.push(`<details><summary>Example raw payload</summary>`);
    sections.push("");
    sections.push("```json");
    let pretty = g.samplePayload;
    try {
      pretty = JSON.stringify(JSON.parse(g.samplePayload), null, 2);
    } catch {
      /* keep raw */
    }
    sections.push(truncate(pretty, MAX_PAYLOAD_EXAMPLE));
    sections.push("```");
    sections.push("");
    sections.push("</details>");
    sections.push("");

    // Top-level field table — only if root is object
    if (g.schema.typeCounts.get("object")) {
      sections.push("**Top-level fields**");
      sections.push("");
      sections.push(...emitFieldTable(g.schema, g.schema.totalObservations));
      sections.push("");

      // Recurse for object-valued fields: emit a nested table for arrays of objects
      // and for nested object fields
      for (const [fname, fsub] of g.schema.fields.entries()) {
        // Array of objects: describe the element shape
        if (
          fsub.typeCounts.size === 1 &&
          fsub.typeCounts.get("array") &&
          fsub.elementSchema &&
          fsub.elementSchema.typeCounts.size === 1 &&
          fsub.elementSchema.typeCounts.get("object")
        ) {
          const elemSchema = fsub.elementSchema;
          const lengths = fsub.arrayLengths;
          const minLen = Math.min(...lengths);
          const maxLen = Math.max(...lengths);
          sections.push(`**\`${fname}\` — array element shape** (length ${minLen === maxLen ? minLen : `${minLen}–${maxLen}`}, ${elemSchema.totalObservations} elements observed)`);
          sections.push("");
          sections.push(...emitFieldTable(elemSchema, elemSchema.totalObservations));
          sections.push("");
        }
        // Array of tuples: positional types
        if (
          fsub.typeCounts.size === 1 &&
          fsub.typeCounts.get("array") &&
          fsub.isTupleLike()
        ) {
          const positionTypes = fsub.positionalSchemas.map((p) => [...p.typeCounts.keys()][0]);
          sections.push(`**\`${fname}\` — tuple positions** (fixed length ${fsub.arrayLengths[0]})`);
          sections.push("");
          sections.push("| Position | Type | Example |");
          sections.push("| --- | --- | --- |");
          fsub.positionalSchemas.forEach((p, idx) => {
            const ex = p.examples.get(positionTypes[idx]);
            sections.push(`| [${idx}] | ${positionTypes[idx]} | ${exampleToCell(ex)} |`);
          });
          sections.push("");
        }
      }
    } else {
      sections.push(`_Payloads are not JSON objects; raw type: ${[...g.schema.typeCounts.keys()].join(", ") || "n/a"}_`);
      sections.push("");
    }

    // Collect TS interface for this PID (only for object-shaped received messages)
    if (g.schema.typeCounts.get("object") && g.direction === "received") {
      const ifaceName = pidNameToIface(pidLabel, "Received", g.variant);
      messageTypeNames.push({
        pid: pidLabel,
        ifaceName,
        direction: g.direction,
        variant: g.variant,
      });
      const collected: string[] = [];
      collected.push(emitInterface(ifaceName, g.schema, collected));
      // Order: nested first, root last (collected[0] is the root we just pushed)
      const root = collected.shift()!;
      allInterfaces.push(...collected, root);
    } else if (g.schema.typeCounts.get("object") && g.direction === "sent") {
      const ifaceName = pidNameToIface(pidLabel, "Sent", g.variant);
      messageTypeNames.push({
        pid: pidLabel,
        ifaceName,
        direction: g.direction,
        variant: g.variant,
      });
      const collected: string[] = [];
      collected.push(emitInterface(ifaceName, g.schema, collected));
      const root = collected.shift()!;
      allInterfaces.push(...collected, root);
    }
  }
}

function pidNameToIface(pid: string, suffix: string, variant?: string): string {
  let base: string;
  if (pid === "LTS_TIMESYNC") base = "LtsTimeSync";
  else if (pid === "(no PID)") base = "LtsClientUnlabeled";
  else if (/^\d+$/.test(pid)) base = `LtsPid${pid}`;
  else base = "Lts" + pid.replace(/[^A-Za-z0-9]/g, "");
  if (variant) {
    base += variant.replace(/[^A-Za-z0-9]/g, "");
  }
  return suffix === "Received" ? base : `${base}Request`;
}

// ---------------------------------------------------------------------------
// Proposed TypeScript schema
// ---------------------------------------------------------------------------
sections.push(`## Proposed TypeScript schema`);
sections.push("");
sections.push(`The schema below is inferred from a finite sample (${totalLines} CDP events). Treat it as a starting point: rare fields may be missing, and stringified numbers should likely be coerced at the boundary. The discriminator is \`PID\`.`);
sections.push("");
sections.push("```ts");
// Discriminated union
const recvMessages = messageTypeNames.filter((m) => m.direction === "received");
const sentMessages = messageTypeNames.filter((m) => m.direction === "sent");
if (recvMessages.length > 0) {
  sections.push(`export type LtsServerMessage =`);
  recvMessages.forEach((m, i) => {
    const sep = i === recvMessages.length - 1 ? ";" : "";
    sections.push(`  | ${m.ifaceName}${sep}`);
  });
  sections.push("");
}
if (sentMessages.length > 0) {
  sections.push(`export type LtsClientMessage =`);
  sentMessages.forEach((m, i) => {
    const sep = i === sentMessages.length - 1 ? ";" : "";
    sections.push(`  | ${m.ifaceName}${sep}`);
  });
  sections.push("");
}
// Refine PID fields to literal types in the root interfaces
for (let i = 0; i < allInterfaces.length; i++) {
  const iface = allInterfaces[i];
  // Find the matching messageTypeNames entry to know the PID literal
  const match = messageTypeNames.find((m) => iface.startsWith(`export interface ${m.ifaceName} `));
  if (match) {
    let refined = iface.replace(/(\n  PID\??: )[^;]+;/, `$1"${match.pid}";`);
    if (match.variant) {
      const m = /^([A-Z]+)=(.+)$/.exec(match.variant);
      if (m) {
        const [, fieldName, value] = m;
        const literal = /^-?\d+(\.\d+)?$/.test(value) ? value : `"${value}"`;
        refined = refined.replace(
          new RegExp(`(\\n  ${fieldName}\\??: )[^;]+;`),
          `$1${literal};`,
        );
      }
    }
    sections.push(refined);
  } else {
    sections.push(iface);
  }
  sections.push("");
}
sections.push("```");
sections.push("");

// Sample raw event payloads at the end for reference
sections.push(`## Notes & caveats`);
sections.push("");
sections.push(`- **Format:** plain UTF-8 JSON objects sent as WebSocket text frames (opcode 1). No SignalR/protobuf/binary framing observed.`);
sections.push(`- **Discriminator:** \`PID\`. Observed values: ${[...new Set([...conns.values()].flatMap((c) => [...c.groups.values()].map((g) => g.pid)))].map((p) => `\`${p}\``).join(", ")}.`);
sections.push(`- **Stringified numbers:** the server encodes most numeric values (lap times, sector lengths, speeds, IDs) as JSON strings. The \`VER\` field is observed as both a number and a string across different PIDs — likely a serialization quirk on the server.`);
sections.push(`- **Empty-string sentinels:** unset numeric fields (e.g. \`S7TIME\`) come back as \`""\`, not \`null\`. Treat empty strings as "not available".`);
sections.push(`- **Stationary RESULT cardinality:** every PID=\`"0"\` snapshot observed in this sample carried exactly 161 entries in \`RESULT\`. That is likely the full entry list; track it for changes once cars retire.`);
sections.push(`- **Time-sync round trip:** the only client→server frame in this capture is \`{eventId, eventPid, clientLocalTime}\`; the server echoes it back as a \`PID=LTS_TIMESYNC\` message with an added \`serverLocalTime\`.`);
sections.push(`- **Sample is short:** a 30-second window during qualifying only surfaced 3 distinct PIDs. Expect more PIDs (incident messages, sector-time updates, pit events) once you capture during the race itself — re-run the analyzer over the full capture.`);
sections.push("");

fs.writeFileSync(outPath, sections.join("\n"));
console.log(`[analyze] wrote ${outPath}`);
console.log(`[analyze] connections=${conns.size} groups=${[...conns.values()].reduce((a, c) => a + c.groups.size, 0)} interfaces=${allInterfaces.length}`);
