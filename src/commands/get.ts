import { writeFileSync } from "node:fs";
import { parseSvgFile, serializeSvg } from "../parser.js";
import { collectRefs, resolveDefsClosure } from "../refs.js";
import { computeBbox } from "../bbox.js";
import { digestPath } from "../digest.js";
import { bboxIntersects, fmtSize, parseBboxSpec } from "../format.js";
import type { SvgNode } from "../types.js";

export type GetOptions = {
  crop?: boolean;
  digest?: boolean;
  pretty?: boolean;
  bbox?: string;
  out?: string;
};

const RASTER_DIGEST_MIN = 200;

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
  if (node.tag === "image") {
    const digested = digestRasterAttrs(node.attrs);
    if (digested) return { ...node, attrs: digested };
  }
  return {
    ...node,
    children: node.children.map((c) => maybeDigestPaths(c, enable)),
  };
}

// Embedded <image href="data:..."> blobs (Figma sometimes wraps a PNG in an
// SVG shell) often dwarf the actual vector content. --digest collapses them
// the same way it collapses long path d attributes, preserving the mime type
// and byte count so the consumer still knows it's a bitmap and how big.
function digestRasterAttrs(attrs: Record<string, string>): Record<string, string> | null {
  const hrefKey = attrs.href != null ? "href" : attrs["xlink:href"] != null ? "xlink:href" : null;
  if (!hrefKey) return null;
  const href = attrs[hrefKey];
  if (!href.startsWith("data:") || href.length < RASTER_DIGEST_MIN) return null;
  const m = href.match(/^data:([^;,]+)/);
  const mime = m ? m[1] : "data";
  const summary = `[bytes=${href.length} ${mime}]`;
  return { ...attrs, [hrefKey]: summary, "data-svq-digest": "1" };
}

export function runGet(path: string, indexSpec: string, opts: GetOptions): void {
  const svg = parseSvgFile(path);
  const nonDefs = svg.topChildren.filter((c) => c.tag !== "defs");

  const [start, end] = parseRange(indexSpec, nonDefs.length);
  let selection = nonDefs.slice(start, end + 1);
  if (selection.length === 0) {
    throw new Error(`Index range ${indexSpec} yielded no elements (have ${nonDefs.length}).`);
  }

  if (opts.bbox) {
    const region = parseBboxSpec(opts.bbox);
    selection = selection.filter((n) => {
      const b = computeBbox(n);
      return b ? bboxIntersects(b, region) : false;
    });
    if (selection.length === 0) {
      throw new Error(`No elements in range ${indexSpec} intersect --bbox ${opts.bbox}.`);
    }
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
  const final = out.endsWith("\n") ? out : out + "\n";
  if (opts.out) {
    writeFileSync(opts.out, final);
    // Summary on stderr so a stdout pipeline (`svq get ... | grep`) still
    // works even when --out is set; users who want the file path on stdout
    // can omit --out and redirect.
    process.stderr.write(`wrote ${fmtSize(final.length)} → ${opts.out}\n`);
    return;
  }
  process.stdout.write(final);
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
