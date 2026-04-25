import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bboxContains,
  bboxIntersects,
  fmtSize,
  fmtBbox,
  parseBboxSpec,
  parsePointSpec,
  pointInBbox,
} from "../src/format.js";

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

describe("bboxIntersects", () => {
  it("returns true for overlapping rects", () => {
    assert.ok(
      bboxIntersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }),
    );
  });
  it("returns false for touching but non-overlapping rects", () => {
    assert.equal(
      bboxIntersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 }),
      false,
    );
  });
  it("returns false for disjoint rects", () => {
    assert.equal(
      bboxIntersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 50, y: 50, w: 5, h: 5 }),
      false,
    );
  });
});

describe("pointInBbox", () => {
  const b = { x: 10, y: 10, w: 20, h: 20 };
  it("matches points inside the bbox", () => {
    assert.ok(pointInBbox(15, 15, b));
  });
  it("matches points on the edge (within tolerance)", () => {
    assert.ok(pointInBbox(10, 10, b));
    assert.ok(pointInBbox(30, 30, b));
  });
  it("rejects points outside", () => {
    assert.equal(pointInBbox(5, 5, b), false);
    assert.equal(pointInBbox(40, 40, b), false);
  });
});

describe("parseBboxSpec", () => {
  it("parses a 4-tuple", () => {
    assert.deepEqual(parseBboxSpec("10,20,30,40"), { x: 10, y: 20, w: 30, h: 40 });
  });
  it("rejects malformed input", () => {
    assert.throws(() => parseBboxSpec("a,b,c,d"));
    assert.throws(() => parseBboxSpec("1,2,3"));
    assert.throws(() => parseBboxSpec("1,2,0,5"));
  });
});

describe("parsePointSpec", () => {
  it("parses a 2-tuple", () => {
    assert.deepEqual(parsePointSpec("10,20"), { x: 10, y: 20 });
  });
  it("rejects malformed input", () => {
    assert.throws(() => parsePointSpec("a,b"));
    assert.throws(() => parsePointSpec("10"));
  });
});
