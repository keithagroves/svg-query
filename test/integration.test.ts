import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runTree } from "../src/commands/tree.js";
import { runGet } from "../src/commands/get.js";
import { runAnalyze } from "../src/commands/analyze.js";
import { runComponents } from "../src/commands/components.js";
import { parseSvgString } from "../src/parser.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const example1 = join(repoRoot, "examplesvg.svg");
const example2 = join(repoRoot, "anotherexample.svg");

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

describe("integration: examplesvg.svg (Figma card)", () => {
  it("tree lists 14 non-defs top-level elements", () => {
    const out = capture(() => runTree(example1));
    // 14 child lines + header + defs line.
    const lines = out.trim().split("\n");
    assert.match(lines[0], /^svg 446×354/);
    const elementLines = lines.filter((l) => /^[├└]─ \[/.test(l));
    assert.equal(elementLines.length, 14, "14 non-defs elements");
    assert.match(out, /└─ defs \(/);
  });

  it("analyze reports flattened text warning", () => {
    const out = capture(() => runAnalyze(example1));
    assert.match(out, /Dimensions: 446 × 354/);
    assert.match(out, /likely flattened text:\s+[1-9]/);
    assert.match(out, /Outline Text/);
  });

  it("components finds nested structure inside the cards", () => {
    const out = capture(() => runComponents(example1));
    // The first card rect (index 1) should contain at least 3 children.
    assert.match(out, /\[1\] rect/);
    assert.match(out, /Summary: \d+ top-level component\(s\), \d+ nested element\(s\)\./);
    // Verify card 1 at index 1 nests at least one element (indented under it).
    const lines = out.split("\n");
    const card1Idx = lines.findIndex((l) => /^\[1\] rect/.test(l));
    assert.ok(card1Idx >= 0, "card 1 should be a root");
    assert.match(lines[card1Idx + 1] ?? "", /^ {2}\[/, "element should nest under card 1");
  });

  it("get <n> --crop produces a valid parseable SVG with only referenced defs", () => {
    // Index 3 in examplesvg is the gradient-filled rect that references paint0_linear_18209_498.
    const out = capture(() => runGet(example1, "3", { crop: true }));
    const parsed = parseSvgString(out);
    assert.equal(parsed.topChildren.length, 2, "defs + rect");
    const [defs, rect] = parsed.topChildren;
    assert.equal(defs.tag, "defs");
    assert.equal(rect.tag, "rect");
    // Only the one gradient should be in defs.
    const gradientIds = defs.children
      .filter((c) => c.tag === "linearGradient")
      .map((c) => c.attrs.id);
    assert.deepEqual(gradientIds, ["paint0_linear_18209_498"]);
    // viewBox should be cropped to the rect size.
    assert.match(parsed.rootAttrs.viewBox ?? "", /^19\.\d+ 62\.\d+ 34\.\d+ 34\.\d+/);
  });

  it("get --digest replaces huge path d with summary", () => {
    // Index 8 is the 61KB body text path.
    const out = capture(() => runGet(example1, "8", { crop: true, digest: true }));
    assert.ok(out.length < 1000, `expected digested output to be small, got ${out.length}B`);
    assert.match(out, /\[subpaths=\d+ bytes=\d+ likely-text\]/);
    assert.match(out, /data-svgq-digest="1"/);
  });

  it("get A..B extracts a contiguous range with shared defs", () => {
    const out = capture(() => runGet(example1, "1..4", { crop: true, digest: true }));
    const parsed = parseSvgString(out);
    // rect, rect, rect, path = 4 elements, plus defs.
    const nonDefs = parsed.topChildren.filter((c) => c.tag !== "defs");
    assert.equal(nonDefs.length, 4);
  });
});

describe("integration: anotherexample.svg (button/row)", () => {
  it("tree shows one g with a filter ref", () => {
    const out = capture(() => runTree(example2));
    assert.match(out, /svg 262×43/);
    assert.match(out, /\[ 0\] g\s+.+refs=\[filter0_dd_17188_79794\]/);
  });

  it("get 0 pulls the referenced filter into defs", () => {
    const out = capture(() => runGet(example2, "0", { crop: true }));
    const parsed = parseSvgString(out);
    const defs = parsed.topChildren.find((c) => c.tag === "defs");
    assert.ok(defs, "defs should be present");
    const filters = defs!.children.filter((c) => c.tag === "filter");
    assert.equal(filters.length, 1);
    assert.equal(filters[0].attrs.id, "filter0_dd_17188_79794");
  });
});
