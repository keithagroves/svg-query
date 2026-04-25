import type { Bbox } from "./types.js";

export function fmtBbox(b: Bbox | null): string {
  if (!b) return "(no bbox)";
  const r = (n: number) => Math.round(n * 10) / 10;
  return `(${r(b.x)},${r(b.y)} ${r(b.w)}×${r(b.h)})`;
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function bboxContains(outer: Bbox, inner: Bbox, tol = 0.5): boolean {
  return (
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    inner.x + inner.w <= outer.x + outer.w + tol &&
    inner.y + inner.h <= outer.y + outer.h + tol
  );
}

export function bboxIntersects(a: Bbox, b: Bbox): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

export function pointInBbox(x: number, y: number, b: Bbox, tol = 0.5): boolean {
  return (
    x >= b.x - tol &&
    x <= b.x + b.w + tol &&
    y >= b.y - tol &&
    y <= b.y + b.h + tol
  );
}

export function parseBboxSpec(spec: string): Bbox {
  const parts = spec.split(",").map((s) => s.trim());
  if (parts.length !== 4) {
    throw new Error(`--bbox expects "x,y,w,h" (got: ${spec})`);
  }
  const [x, y, w, h] = parts.map(Number);
  if (![x, y, w, h].every(Number.isFinite)) {
    throw new Error(`--bbox values must be numbers (got: ${spec})`);
  }
  if (w <= 0 || h <= 0) {
    throw new Error(`--bbox width/height must be positive (got: ${spec})`);
  }
  return { x, y, w, h };
}

export function parsePointSpec(spec: string): { x: number; y: number } {
  const parts = spec.split(",").map((s) => s.trim());
  if (parts.length !== 2) {
    throw new Error(`point expects "x,y" (got: ${spec})`);
  }
  const [x, y] = parts.map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`point values must be numbers (got: ${spec})`);
  }
  return { x, y };
}
