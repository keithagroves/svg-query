import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runTree } from "../src/commands/tree.js";
import { runGet } from "../src/commands/get.js";
import { runAnalyze } from "../src/commands/analyze.js";
import { runComponents } from "../src/commands/components.js";
import { parseSvgString } from "../src/parser.js";

const here = dirname(fileURLToPath(import.meta.url));
const card = join(here, "fixtures/card.svg");
const button = join(here, "fixtures/button.svg");

function capture(fn: () => void): string {
  const chunks: string[] = [];
  const origLog = console.log;
  const origWrite = process.stdout.write.bind(process.stdout);
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" ") + "\n");
  };
  (process.stdout.write as unknown) = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  };
  try {
    fn();
  } finally {
    console.log = origLog;
    process.stdout.write = origWrite;
  }
  return chunks.join("");
}

describe("integration: card.svg (Figma-style flat card)", () => {
  it("tree enumerates every top-level non-defs element", () => {
    const out = capture(() => runTree(card));
    assert.match(out, /^svg 200×120/);
    const elementLines = out.split("\n").filter((l) => /^[├└]─ \[/.test(l));
    assert.equal(elementLines.length, 7);
    assert.match(out, /└─ defs \(/);
  });

  it("analyze reports flattened text and design tokens", () => {
    const out = capture(() => runAnalyze(card));
    assert.match(out, /Dimensions: 200 × 120/);
    assert.match(out, /likely flattened text:\s+[1-9]/);
    assert.match(out, /Outline Text/);
    assert.match(out, /#f3f3f8/);
    assert.match(out, /\d+ linear/);
  });

  it("components nests elements under the card background", () => {
    const out = capture(() => runComponents(card));
    assert.match(out, /Summary: \d+ top-level component\(s\), \d+ nested element\(s\)\./);
    const lines = out.split("\n");
    // Index 0 is the card background rect — it should have nested children.
    const rootIdx = lines.findIndex((l) => /^\[0\] rect/.test(l));
    assert.ok(rootIdx >= 0, "card root should appear");
    assert.match(lines[rootIdx + 1] ?? "", /^ {2}\[/, "children should nest under index 0");
  });

  it("get <n> --crop produces a valid SVG carrying only referenced defs", () => {
    // Index 1 is the gradient-filled rect; it refs grad1, not 'unused'.
    const out = capture(() => runGet(card, "1", { crop: true }));
    const parsed = parseSvgString(out);
    assert.equal(parsed.topChildren.length, 2, "defs + rect");
    const [defs, rect] = parsed.topChildren;
    assert.equal(defs.tag, "defs");
    assert.equal(rect.tag, "rect");
    const gradientIds = defs.children
      .filter((c) => c.tag === "linearGradient")
      .map((c) => c.attrs.id);
    assert.deepEqual(gradientIds, ["grad1"], "only referenced gradient should be inlined");
    assert.match(parsed.rootAttrs.viewBox ?? "", /^10 10 30 30/);
  });

  it("get --digest replaces large paths with a digest marker", () => {
    // Index 5 is the body-text path (many small subpaths = flagged as text).
    const out = capture(() => runGet(card, "5", { crop: true, digest: true }));
    assert.match(out, /\[subpaths=\d+ bytes=\d+ likely-text\]/);
    assert.match(out, /data-svq-digest="1"/);
  });

  it("get A..B extracts a contiguous range", () => {
    const out = capture(() => runGet(card, "0..2", { crop: true, digest: true }));
    const parsed = parseSvgString(out);
    const nonDefs = parsed.topChildren.filter((c) => c.tag !== "defs");
    assert.equal(nonDefs.length, 3);
  });
});

describe("integration: button.svg (g with filter ref)", () => {
  it("tree flags the filter reference", () => {
    const out = capture(() => runTree(button));
    assert.match(out, /svg 100×40/);
    assert.match(out, /\[ 0\] g\s+.+refs=\[shadow1\]/);
  });

  it("get 0 pulls the referenced filter into defs", () => {
    const out = capture(() => runGet(button, "0", { crop: true }));
    const parsed = parseSvgString(out);
    const defs = parsed.topChildren.find((c) => c.tag === "defs");
    assert.ok(defs, "defs should be present");
    const filters = defs!.children.filter((c) => c.tag === "filter");
    assert.equal(filters.length, 1);
    assert.equal(filters[0].attrs.id, "shadow1");
  });
});
