import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeBbox } from "../src/bbox.js";
import type { SvgNode } from "../src/types.js";

const node = (tag: string, attrs: Record<string, string>, children: SvgNode[] = []): SvgNode => ({
  tag,
  attrs,
  children,
});

const approx = (a: number, b: number, eps = 0.01) =>
  Math.abs(a - b) < eps || assert.fail(`expected ${a} ≈ ${b}`);

describe("bbox", () => {
  it("rect", () => {
    const b = computeBbox(node("rect", { x: "10", y: "20", width: "30", height: "40" }));
    assert.deepEqual(b, { x: 10, y: 20, w: 30, h: 40 });
  });

  it("circle", () => {
    const b = computeBbox(node("circle", { cx: "50", cy: "50", r: "10" }));
    assert.deepEqual(b, { x: 40, y: 40, w: 20, h: 20 });
  });

  it("ellipse", () => {
    const b = computeBbox(node("ellipse", { cx: "0", cy: "0", rx: "5", ry: "3" }));
    assert.deepEqual(b, { x: -5, y: -3, w: 10, h: 6 });
  });

  it("line", () => {
    const b = computeBbox(node("line", { x1: "0", y1: "10", x2: "20", y2: "0" }));
    assert.deepEqual(b, { x: 0, y: 0, w: 20, h: 10 });
  });

  it("polygon", () => {
    const b = computeBbox(node("polygon", { points: "0,0 10,5 5,10" }));
    assert.deepEqual(b, { x: 0, y: 0, w: 10, h: 10 });
  });

  it("path: simple M L", () => {
    const b = computeBbox(node("path", { d: "M 10 20 L 30 40" }));
    assert.ok(b);
    approx(b!.x, 10);
    approx(b!.y, 20);
    approx(b!.w, 20);
    approx(b!.h, 20);
  });

  it("path: missing d returns null", () => {
    const b = computeBbox(node("path", {}));
    assert.equal(b, null);
  });

  it("g: unions child bboxes", () => {
    const g = node("g", {}, [
      node("rect", { x: "0", y: "0", width: "10", height: "10" }),
      node("rect", { x: "20", y: "20", width: "5", height: "5" }),
    ]);
    const b = computeBbox(g);
    assert.deepEqual(b, { x: 0, y: 0, w: 25, h: 25 });
  });

  it("applies translate transform", () => {
    const rect = node("rect", {
      x: "0",
      y: "0",
      width: "10",
      height: "10",
      transform: "translate(5, 7)",
    });
    const b = computeBbox(rect);
    assert.deepEqual(b, { x: 5, y: 7, w: 10, h: 10 });
  });

  it("applies matrix transform", () => {
    const rect = node("rect", {
      x: "0",
      y: "0",
      width: "10",
      height: "10",
      transform: "matrix(2 0 0 2 3 4)",
    });
    const b = computeBbox(rect);
    assert.deepEqual(b, { x: 3, y: 4, w: 20, h: 20 });
  });

  it("applies scale transform", () => {
    const rect = node("rect", {
      x: "0",
      y: "0",
      width: "10",
      height: "10",
      transform: "scale(2)",
    });
    const b = computeBbox(rect);
    assert.deepEqual(b, { x: 0, y: 0, w: 20, h: 20 });
  });

  it("unknown tag returns null", () => {
    assert.equal(computeBbox(node("wibble", {})), null);
  });
});
