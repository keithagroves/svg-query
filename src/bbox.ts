import pathBounds from "svg-path-bounds";
import type { Bbox, SvgNode } from "./types.js";

const num = (s: string | undefined, fallback = 0): number => {
  if (s == null) return fallback;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
};

type Matrix = [number, number, number, number, number, number]; // a b c d e f

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function parseTransform(s: string | undefined): Matrix {
  if (!s) return IDENTITY;
  let m: Matrix = IDENTITY;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(s)) !== null) {
    const fn = match[1];
    const args = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let local: Matrix = IDENTITY;
    if (fn === "translate") {
      local = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
    } else if (fn === "scale") {
      const sx = args[0] ?? 1;
      const sy = args[1] ?? sx;
      local = [sx, 0, 0, sy, 0, 0];
    } else if (fn === "matrix" && args.length === 6) {
      local = args as Matrix;
    }
    // rotate/skew omitted for MVP — Figma exports rarely use them at top level.
    m = multiply(m, local);
  }
  return m;
}

function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = m;
  return [a * x + c * y + e, b * x + d * y + f];
}

function transformBbox(b: Bbox, m: Matrix): Bbox {
  const pts: Array<[number, number]> = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ].map(([x, y]) => applyMatrix(m, x, y));
  return bboxFromPoints(pts);
}

function bboxFromPoints(pts: Array<[number, number]>): Bbox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function union(a: Bbox | null, b: Bbox | null): Bbox | null {
  if (!a) return b;
  if (!b) return a;
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.w, b.x + b.w);
  const maxY = Math.max(a.y + a.h, b.y + b.h);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function localBbox(node: SvgNode): Bbox | null {
  const a = node.attrs;
  switch (node.tag) {
    case "rect": {
      return { x: num(a.x), y: num(a.y), w: num(a.width), h: num(a.height) };
    }
    case "circle": {
      const cx = num(a.cx), cy = num(a.cy), r = num(a.r);
      return { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
    }
    case "ellipse": {
      const cx = num(a.cx), cy = num(a.cy), rx = num(a.rx), ry = num(a.ry);
      return { x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry };
    }
    case "line": {
      return bboxFromPoints([
        [num(a.x1), num(a.y1)],
        [num(a.x2), num(a.y2)],
      ]);
    }
    case "polygon":
    case "polyline": {
      if (!a.points) return null;
      const nums = a.points.split(/[\s,]+/).filter(Boolean).map(Number);
      const pts: Array<[number, number]> = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
      return bboxFromPoints(pts);
    }
    case "path": {
      if (!a.d) return null;
      try {
        const [x1, y1, x2, y2] = pathBounds(a.d);
        return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}

export function computeBbox(node: SvgNode): Bbox | null {
  const m = parseTransform(node.attrs.transform);
  if (node.tag === "g" || node.tag === "svg") {
    let acc: Bbox | null = null;
    for (const c of node.children) {
      if (c.tag === "#text" || c.tag === "defs") continue;
      const cb = computeBbox(c);
      acc = union(acc, cb);
    }
    if (!acc) return null;
    return m === IDENTITY ? acc : transformBbox(acc, m);
  }
  const b = localBbox(node);
  if (!b) return null;
  return m === IDENTITY ? b : transformBbox(b, m);
}
