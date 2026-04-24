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
