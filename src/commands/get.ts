import { parseSvgFile, serializeSvg } from "../parser.js";
import { collectRefs, resolveDefsClosure } from "../refs.js";
import { computeBbox } from "../bbox.js";
import { digestPath } from "../digest.js";
import type { SvgNode } from "../types.js";

export type GetOptions = {
  crop?: boolean;
  digest?: boolean;
  pretty?: boolean;
};

function maybeDigestPaths(node: SvgNode, enable: boolean): SvgNode {
  if (!enable) return node;
  if (node.tag === "path" && node.attrs.d) {
    const dg = digestPath(node.attrs.d);
    if (dg && (dg.likelyText || dg.dLength > 4000)) {
      const digestAttr = `[subpaths=${dg.subpathCount} bytes=${dg.dLength}${dg.likelyText ? " likely-text" : ""}]`;
      return {
        ...node,
        attrs: { ...node.attrs, d: digestAttr, "data-svq-digest": "1" },
      };
    }
  }
  return {
    ...node,
    children: node.children.map((c) => maybeDigestPaths(c, enable)),
  };
}

export function runGet(path: string, indexSpec: string, opts: GetOptions): void {
  const svg = parseSvgFile(path);
  const nonDefs = svg.topChildren.filter((c) => c.tag !== "defs");

  const [start, end] = parseRange(indexSpec, nonDefs.length);
  const selection = nonDefs.slice(start, end + 1);
  if (selection.length === 0) {
    throw new Error(`Index range ${indexSpec} yielded no elements (have ${nonDefs.length}).`);
  }

  const refIds = new Set<string>();
  for (const n of selection) collectRefs(n, refIds);
  const { nodes: defsNodes } = resolveDefsClosure(refIds, svg.defsById);

  const rootAttrs = { ...svg.rootAttrs };
  if (opts.crop) {
    let unionBbox = null as ReturnType<typeof computeBbox>;
    for (const n of selection) {
      const b = computeBbox(n);
      if (!b) continue;
      if (!unionBbox) unionBbox = { ...b };
      else {
        const x1 = Math.min(unionBbox.x, b.x);
        const y1 = Math.min(unionBbox.y, b.y);
        const x2 = Math.max(unionBbox.x + unionBbox.w, b.x + b.w);
        const y2 = Math.max(unionBbox.y + unionBbox.h, b.y + b.h);
        unionBbox = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      }
    }
    if (unionBbox) {
      rootAttrs.viewBox = `${unionBbox.x} ${unionBbox.y} ${unionBbox.w} ${unionBbox.h}`;
      rootAttrs.width = String(unionBbox.w);
      rootAttrs.height = String(unionBbox.h);
    }
  }

  const children: SvgNode[] = [];
  if (defsNodes.length > 0) {
    children.push({ tag: "defs", attrs: {}, children: defsNodes });
  }
  for (const n of selection) children.push(maybeDigestPaths(n, opts.digest ?? false));

  const out = serializeSvg(rootAttrs, children);
  process.stdout.write(out.endsWith("\n") ? out : out + "\n");
}

function parseRange(spec: string, total: number): [number, number] {
  if (spec.includes("..")) {
    const [a, b] = spec.split("..").map((s) => s.trim());
    const start = a === "" ? 0 : parseInt(a, 10);
    const end = b === "" ? total - 1 : parseInt(b, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      throw new Error(`Invalid range: ${spec}`);
    }
    return [clamp(start, 0, total - 1), clamp(end, 0, total - 1)];
  }
  const n = parseInt(spec, 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid index: ${spec}`);
  return [clamp(n, 0, total - 1), clamp(n, 0, total - 1)];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
