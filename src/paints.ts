import type { SvgNode } from "./types.js";

export type ResolvedPaint = {
  kind: "linear" | "radial" | "pattern" | "unknown";
  stops: Array<{ offset: number; color: string }>;
  angleDeg?: number; // linear only
  patternMime?: string; // pattern that wraps an <image data:...>
};

function parseStops(node: SvgNode): Array<{ offset: number; color: string }> {
  const out: Array<{ offset: number; color: string }> = [];
  for (const c of node.children) {
    if (c.tag !== "stop") continue;
    const offset = c.attrs.offset != null ? parseFloat(c.attrs.offset) : out.length === 0 ? 0 : 1;
    const color = (c.attrs["stop-color"] ?? "currentColor").toLowerCase();
    out.push({ offset: Number.isFinite(offset) ? offset : 0, color });
  }
  return out;
}

function linearAngleDeg(node: SvgNode): number | undefined {
  const x1 = parseFloat(node.attrs.x1 ?? "");
  const y1 = parseFloat(node.attrs.y1 ?? "");
  const x2 = parseFloat(node.attrs.x2 ?? "");
  const y2 = parseFloat(node.attrs.y2 ?? "");
  if (![x1, y1, x2, y2].every(Number.isFinite)) return undefined;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return undefined;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return Math.round(deg);
}

function patternRasterMime(node: SvgNode): string | undefined {
  // <pattern> often contains <use href="#imageX"/> pointing to <image>; check
  // both direct <image> children and nested <use> pattern that Figma emits.
  for (const c of node.children) {
    if (c.tag === "image") {
      const href = c.attrs.href ?? c.attrs["xlink:href"] ?? "";
      const m = href.match(/^data:([^;,]+)/);
      if (m) return m[1];
    }
  }
  return undefined;
}

export function resolvePaint(
  url: string,
  defsById: Map<string, SvgNode>,
): ResolvedPaint | null {
  const m = url.match(/^url\(#([^)]+)\)$/);
  if (!m) return null;
  const id = m[1];
  const def = defsById.get(id);
  if (!def) return null;
  if (def.tag === "linearGradient") {
    return { kind: "linear", stops: resolveStops(def, defsById), angleDeg: linearAngleDeg(def) };
  }
  if (def.tag === "radialGradient") {
    return { kind: "radial", stops: resolveStops(def, defsById) };
  }
  if (def.tag === "pattern") {
    return { kind: "pattern", stops: [], patternMime: patternRasterMime(def) };
  }
  return { kind: "unknown", stops: [] };
}

// Gradients commonly use href/xlink:href to inherit stops from another
// gradient — chase that chain when we don't see <stop>s directly.
function resolveStops(
  node: SvgNode,
  defsById: Map<string, SvgNode>,
  seen: Set<string> = new Set(),
): Array<{ offset: number; color: string }> {
  const direct = parseStops(node);
  if (direct.length > 0) return direct;
  const href = node.attrs.href ?? node.attrs["xlink:href"];
  if (!href || !href.startsWith("#")) return [];
  const id = href.slice(1);
  if (seen.has(id)) return [];
  seen.add(id);
  const next = defsById.get(id);
  if (!next) return [];
  return resolveStops(next, defsById, seen);
}

export function formatPaint(p: ResolvedPaint): string {
  if (p.kind === "pattern") {
    return p.patternMime ? `pattern(image ${p.patternMime})` : "pattern";
  }
  if (p.stops.length === 0) return p.kind;
  const colors = p.stops.map((s) => s.color).join("→");
  if (p.kind === "linear") {
    return p.angleDeg != null ? `linear(${colors} @${p.angleDeg}°)` : `linear(${colors})`;
  }
  if (p.kind === "radial") return `radial(${colors})`;
  return colors;
}
