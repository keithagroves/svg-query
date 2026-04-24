import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bboxContains, fmtSize, fmtBbox } from "../src/format.js";

describe("bboxContains", () => {
  const outer = { x: 0, y: 0, w: 100, h: 100 };

  it("returns true when inner is fully inside outer", () => {
    assert.ok(bboxContains(outer, { x: 10, y: 10, w: 20, h: 20 }));
  });

  it("returns true for equal bboxes within tolerance", () => {
    assert.ok(bboxContains(outer, { x: 0, y: 0, w: 100, h: 100 }));
  });

  it("returns false when inner overflows the right edge", () => {
    assert.equal(bboxContains(outer, { x: 50, y: 0, w: 60, h: 10 }), false);
  });

  it("returns false when inner starts left of outer", () => {
    assert.equal(bboxContains(outer, { x: -5, y: 10, w: 10, h: 10 }), false);
  });
});

describe("fmtSize", () => {
  it("formats bytes", () => {
    assert.equal(fmtSize(512), "512B");
  });
  it("formats kilobytes", () => {
    assert.equal(fmtSize(2048), "2.0KB");
  });
  it("formats megabytes", () => {
    assert.equal(fmtSize(5 * 1024 * 1024), "5.0MB");
  });
});

describe("fmtBbox", () => {
  it("formats a bbox", () => {
    assert.equal(fmtBbox({ x: 1.23, y: 4.567, w: 10, h: 20 }), "(1.2,4.6 10×20)");
  });
  it("handles null", () => {
    assert.equal(fmtBbox(null), "(no bbox)");
  });
});
