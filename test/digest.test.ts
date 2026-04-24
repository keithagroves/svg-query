import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { digestPath, classifyElement } from "../src/digest.js";
import type { SvgNode } from "../src/types.js";

describe("digestPath", () => {
  it("returns null for missing d", () => {
    assert.equal(digestPath(undefined), null);
  });

  it("counts subpaths via M/m commands", () => {
    const dg = digestPath("M 0 0 L 10 10 m 5 5 L 20 20 M 30 30");
    assert.ok(dg);
    assert.equal(dg!.subpathCount, 3);
  });

  it("flags flattened text: many small subpaths", () => {
    // Simulate 20 letter-sized subpaths — short d per subpath.
    const d = Array.from({ length: 20 }, (_, i) => `M${i} 0 L${i + 1} 1`).join(" ");
    const dg = digestPath(d)!;
    assert.ok(dg.likelyText, "many small subpaths should be flagged as text");
    assert.ok(!dg.likelyIcon);
  });

  it("flags icon: few subpaths, small d", () => {
    const dg = digestPath("M0 0 L10 10 L20 0 Z M5 5 L15 5 L10 15 Z")!;
    assert.ok(dg.likelyIcon);
    assert.ok(!dg.likelyText);
  });

  it("does not flag a single huge path as text or icon", () => {
    const huge = "M0 0 " + Array.from({ length: 2000 }, (_, i) => `L${i} ${i}`).join(" ");
    const dg = digestPath(huge)!;
    assert.ok(!dg.likelyText);
    assert.ok(!dg.likelyIcon);
  });
});

describe("classifyElement", () => {
  const pathNode = (d: string): SvgNode => ({ tag: "path", attrs: { d }, children: [] });

  it("classifies flattened text", () => {
    const d = Array.from({ length: 20 }, (_, i) => `M${i} 0 L${i + 1} 1`).join(" ");
    assert.equal(classifyElement(pathNode(d)), "text(flattened)");
  });

  it("classifies icon", () => {
    assert.equal(classifyElement(pathNode("M0 0 L10 10 L20 0 Z")), "icon?");
  });

  it("passes through non-path tags", () => {
    assert.equal(classifyElement({ tag: "rect", attrs: {}, children: [] }), "rect");
  });
});
