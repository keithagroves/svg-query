import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runTree } from "../src/commands/tree.js";
import { runGet } from "../src/commands/get.js";
import { runAnalyze } from "../src/commands/analyze.js";
import { runComponents } from "../src/commands/components.js";
import { runAt } from "../src/commands/at.js";
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

  it("get --bbox restricts the selection to elements intersecting a region", () => {
    // Card root is 200×120; restrict to the top-right corner (button area).
    const out = capture(() =>
      runGet(card, "0..6", { crop: true, bbox: "130,0,80,40" }),
    );
    const parsed = parseSvgString(out);
    const nonDefs = parsed.topChildren.filter((c) => c.tag !== "defs");
    // Should include at least the button rect (index 3) and its label path,
    // but NOT body-text paths at y=60+ which are outside the region.
    assert.ok(nonDefs.length >= 1);
    assert.ok(nonDefs.length < 7, "bbox filter should drop elements outside the region");
  });

  it("at lists elements containing a point, smallest first", () => {
    // Point (15, 15) is inside both the card root rect and the icon-chip rect.
    const out = capture(() => runAt(card, "15,15"));
    assert.match(out, /element\(s\) contain point \(15, 15\)/);
    const lines = out.split("\n").filter((l) => /^\[\d+\]/.test(l));
    assert.ok(lines.length >= 2, "should hit at least the card + icon chip");
    // Smallest first: index of the icon chip should appear before the card root.
    const iconLine = lines.findIndex((l) => /\[1\]/.test(l));
    const cardLine = lines.findIndex((l) => /\[0\]/.test(l));
    assert.ok(iconLine >= 0 && cardLine >= 0);
    assert.ok(iconLine < cardLine, "smaller bbox should be listed first");
  });
});

describe("integration: wrapped Figma-style export", () => {
  // Mirrors the real friction case: a clip-path-free <g> wraps the whole
  // scene, so without unwrapping `components` would collapse to one root.
  const wrapped = `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<g transform="translate(0,0)">
<rect x="0" y="0" width="100" height="100" fill="#eee"/>
<rect x="10" y="10" width="20" height="20" fill="#222"/>
<rect x="40" y="10" width="20" height="20" fill="#444"/>
<rect x="70" y="10" width="20" height="20" fill="#666"/>
<rect x="10" y="40" width="80" height="10" fill="#888"/>
<rect x="10" y="60" width="80" height="10" fill="#aaa"/>
</g>
</svg>`;

  it("unwraps the bare wrapper so components sees real elements", () => {
    const parsed = parseSvgString(wrapped);
    const nonDefs = parsed.topChildren.filter((c) => c.tag !== "defs");
    assert.equal(nonDefs.length, 6);
  });

  it("flattens a passthrough full-canvas root in components output", async () => {
    // Use a temp file because runComponents takes a path.
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const tmp = mkdtempSync(join(tmpdir(), "svgx-"));
    const file = join(tmp, "wrapped.svg");
    writeFileSync(file, wrapped);
    const out = capture(() => runComponents(file));
    assert.match(out, /skipped passthrough container/);
    // The five small rects (indices 1..5) should be top-level after the
    // full-canvas backdrop is elided.
    const topLines = out.split("\n").filter((l) => /^\[\d+\] rect/.test(l));
    assert.ok(topLines.length >= 5, `expected >=5 top-level rects, got ${topLines.length}`);
  });
});

describe("integration: embedded raster detection", () => {
  // Simulate Figma's "wrap a PNG in an SVG" pattern. The href is short data
  // but long enough to cross the digest threshold.
  const fakePng = "data:image/png;base64," + "A".repeat(400);
  const rasterSvg = `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image x="0" y="0" width="100" height="100" xlink:href="${fakePng}"/></svg>`;

  it("analyze warns when an embedded bitmap is found", async () => {
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const tmp = mkdtempSync(join(tmpdir(), "svgx-"));
    const file = join(tmp, "raster.svg");
    writeFileSync(file, rasterSvg);
    const out = capture(() => runAnalyze(file));
    assert.match(out, /embedded bitmap/);
    assert.match(out, /image\/png/);
  });

  it("get --digest collapses base64 image href into a byte/mime summary", async () => {
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const tmp = mkdtempSync(join(tmpdir(), "svgx-"));
    const file = join(tmp, "raster.svg");
    writeFileSync(file, rasterSvg);
    const out = capture(() => runGet(file, "0", { crop: true, digest: true }));
    assert.match(out, /\[bytes=\d+ image\/png\]/);
    assert.match(out, /data-svq-digest="1"/);
    assert.ok(!out.includes("AAAA"), "base64 payload should be elided");
  });
});

describe("integration: paint resolution", () => {
  it("analyze lists gradient stops with angle", () => {
    const out = capture(() => runAnalyze(card));
    // card.svg fixture has linearGradient #grad1 from #2E31B7 to #1C1460
    assert.match(out, /grad1\s+linear\(#2e31b7→#1c1460/);
  });

  it("tree --resolve-paints expands url() fills inline", () => {
    const out = capture(() => runTree(card, { resolvePaints: true }));
    assert.match(out, /fill=linear\(#2e31b7→#1c1460/);
    // The original url(#grad1) should NOT appear when --resolve-paints is on.
    assert.ok(!/fill=url\(#grad1\)/.test(out));
  });

  it("tree without --resolve-paints leaves url() fills as-is", () => {
    const out = capture(() => runTree(card));
    assert.match(out, /fill=url\(#grad1\)/);
  });

  it("components --resolve-paints expands url() in nested entries", () => {
    const out = capture(() => runComponents(card, { resolvePaints: true }));
    assert.match(out, /fill=linear\(#2e31b7→#1c1460/);
  });
});

describe("integration: fill+stroke sibling folding", () => {
  it("merges adjacent rect entries with identical bbox into one line", async () => {
    const xml = `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
<rect x="10" y="10" width="80" height="60" rx="6" fill="#ffffff"/>
<rect x="10" y="10" width="80" height="60" rx="6" stroke="#cccccc" stroke-width="2" fill="none"/>
<rect x="20" y="80" width="20" height="10" fill="#222222"/>
</svg>`;
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const tmp = mkdtempSync(join(tmpdir(), "svgx-"));
    const file = join(tmp, "fold.svg");
    writeFileSync(file, xml);
    const out = capture(() => runComponents(file));
    // Folded entry [1] should NOT appear as its own visible line.
    const lines = out.split("\n");
    const fillLine = lines.find((l) => /\[0\] rect/.test(l));
    assert.ok(fillLine, "fill rect should be present");
    assert.match(fillLine!, /fill=#ffffff/);
    assert.match(fillLine!, /stroke=#cccccc/);
    assert.match(fillLine!, /merged stroke from \[1\]/);
    assert.ok(
      !lines.some((l) => /^\[1\] rect/.test(l)),
      "stroke twin should be folded out of the printed tree",
    );
  });
});

describe("integration: --out flag", () => {
  it("writes the SVG to the path and emits a one-line summary", async () => {
    const { mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const tmp = mkdtempSync(join(tmpdir(), "svgx-"));
    const outFile = join(tmp, "out.svg");
    const stderrChunks: string[] = [];
    const origErr = process.stderr.write.bind(process.stderr);
    (process.stderr.write as unknown) = (chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    };
    try {
      const stdout = capture(() => runGet(card, "0..6", { crop: true, out: outFile }));
      assert.equal(stdout, "", "stdout should be empty when --out is set");
    } finally {
      process.stderr.write = origErr;
    }
    const stderr = stderrChunks.join("");
    assert.match(stderr, /wrote .* → .*out\.svg/);
    const written = readFileSync(outFile, "utf8");
    const reparsed = parseSvgString(written);
    assert.ok(reparsed.topChildren.length > 0);
  });
});

describe("integration: image-frame detection", () => {
  it("annotates a sibling pair where inner rect uses a pattern-with-image fill", async () => {
    const fakePng = "data:image/png;base64," + "A".repeat(400);
    const xml = `<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<rect x="0" y="0" width="200" height="200" fill="#fff"/>
<rect x="20" y="20" width="160" height="160" rx="12" fill="#eee"/>
<rect x="30" y="30" width="140" height="140" fill="url(#pat)"/>
<defs>
<pattern id="pat" patternUnits="userSpaceOnUse" width="140" height="140">
<image xlink:href="${fakePng}" width="140" height="140"/>
</pattern>
</defs>
</svg>`;
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const tmp = mkdtempSync(join(tmpdir(), "svgx-"));
    const file = join(tmp, "frame.svg");
    writeFileSync(file, xml);
    const out = capture(() => runComponents(file));
    assert.match(out, /image-frame/);
    assert.match(out, /image\/png/);
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
