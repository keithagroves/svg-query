import { parseSvgFile } from "../parser.js";
import { computeBbox } from "../bbox.js";
import { collectRefs } from "../refs.js";
import { classifyElement, digestPath } from "../digest.js";
import { fmtBbox, bboxContains, fmtSize } from "../format.js";
import { formatPaint, resolvePaint } from "../paints.js";
import type { Bbox, ParsedSvg, SvgNode } from "../types.js";

export type ComponentsOptions = { resolvePaints?: boolean };

// A root that spans nearly the whole canvas with many children is almost
// always a backdrop/wrapper (full-canvas rect, frame). Surfacing it as the
// only top-level component buries the real structure under one line, so we
// elide it and promote its children. Tunable thresholds — set conservatively
// to avoid demoting a legitimate card that happens to fill the artboard.
const PASSTHROUGH_AREA_RATIO = 0.85;
const PASSTHROUGH_MIN_CHILDREN = 5;

type Entry = {
  index: number;
  node: SvgNode;
  bbox: Bbox | null;
  area: number;
  children: Entry[];
  parent: Entry | null;
  note?: string;
  folded?: boolean;
};

function area(b: Bbox | null): number {
  return b ? b.w * b.h : 0;
}

function buildContainmentTree(entries: Entry[]): Entry[] {
  // Sort candidates by area descending so the smallest containing parent wins.
  for (const e of entries) {
    if (!e.bbox) continue;
    let bestParent: Entry | null = null;
    let bestArea = Infinity;
    for (const p of entries) {
      if (p === e || !p.bbox) continue;
      if (p.index >= e.index) continue; // parent must be drawn before child
      if (!bboxContains(p.bbox, e.bbox)) continue;
      if (p.area <= e.area) continue; // must be strictly larger
      if (p.area < bestArea) {
        bestArea = p.area;
        bestParent = p;
      }
    }
    if (bestParent) {
      e.parent = bestParent;
      bestParent.children.push(e);
    }
  }
  return entries.filter((e) => e.parent === null);
}

function formatPaintAttr(value: string, svg: ParsedSvg, resolve: boolean): string {
  if (!value || value === "none") return value;
  if (!resolve || !value.startsWith("url(")) return value;
  const r = resolvePaint(value, svg.defsById);
  return r ? formatPaint(r) : value;
}

function describe(entry: Entry, svg: ParsedSvg, resolvePaintsOpt: boolean): string {
  const n = entry.node;
  const kind = classifyElement(n);
  const bbox = fmtBbox(entry.bbox);
  const fillVal = n.attrs.fill;
  const fill =
    fillVal && fillVal !== "none"
      ? ` fill=${formatPaintAttr(fillVal, svg, resolvePaintsOpt)}`
      : "";
  const stroke = n.attrs.stroke
    ? ` stroke=${formatPaintAttr(n.attrs.stroke, svg, resolvePaintsOpt)}`
    : "";
  const id = n.attrs.id ? ` id=${n.attrs.id}` : "";
  let extra = "";
  if (n.tag === "path" && n.attrs.d) {
    const dg = digestPath(n.attrs.d);
    if (dg) extra = ` d=${fmtSize(dg.dLength)}`;
  }
  const refs = new Set<string>();
  collectRefs(n, refs);
  const refStr = refs.size > 0 ? ` refs=${refs.size}` : "";
  const note = entry.note ? ` ${entry.note}` : "";
  return `[${entry.index}] ${kind.padEnd(16)} ${bbox}${fill}${stroke}${id}${extra}${refStr}${note}`;
}

function printTree(entry: Entry, svg: ParsedSvg, resolvePaintsOpt: boolean, depth = 0): void {
  if (entry.folded) return;
  const indent = "  ".repeat(depth);
  console.log(`${indent}${describe(entry, svg, resolvePaintsOpt)}`);
  for (const c of entry.children) printTree(c, svg, resolvePaintsOpt, depth + 1);
}

function canvasArea(svg: ParsedSvg): number {
  const vb = svg.rootAttrs.viewBox;
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      return Math.abs(parts[2] * parts[3]);
    }
  }
  const w = parseFloat(svg.rootAttrs.width ?? "");
  const h = parseFloat(svg.rootAttrs.height ?? "");
  if (Number.isFinite(w) && Number.isFinite(h)) return Math.abs(w * h);
  return 0;
}

function flattenPassthroughRoots(
  roots: Entry[],
  canvas: number,
): { roots: Entry[]; elided: Entry[] } {
  const elided: Entry[] = [];
  let current = roots;
  while (current.length === 1 && canvas > 0) {
    const r = current[0];
    if (!r.bbox) break;
    if (r.area / canvas < PASSTHROUGH_AREA_RATIO) break;
    if (r.children.length < PASSTHROUGH_MIN_CHILDREN) break;
    elided.push(r);
    for (const c of r.children) c.parent = null;
    current = r.children;
  }
  return { roots: current, elided };
}

// Sibling pair where one entry has fill and the next has only stroke at the
// same bbox is the Figma fill+stroke split — fold them into a single line so
// the consumer doesn't render both as separate boxes. We mutate the entries
// list in place: the stroke twin gets a `note` flagging the merge, the fill
// twin's display is rewritten to include the stroke.
function foldFillStrokeSiblings(entries: Entry[]): void {
  // Compare each entry to its siblings under the same parent.
  const groups = new Map<Entry | null, Entry[]>();
  for (const e of entries) {
    const arr = groups.get(e.parent) ?? [];
    arr.push(e);
    groups.set(e.parent, arr);
  }
  for (const siblings of groups.values()) {
    siblings.sort((a, b) => a.index - b.index);
    for (let i = 0; i + 1 < siblings.length; i++) {
      const a = siblings[i];
      const b = siblings[i + 1];
      if (!a.bbox || !b.bbox) continue;
      if (!bboxesEqual(a.bbox, b.bbox)) continue;
      const aHasFill = !!a.node.attrs.fill && a.node.attrs.fill !== "none";
      const bHasStroke = !!b.node.attrs.stroke;
      const bFillNone = !b.node.attrs.fill || b.node.attrs.fill === "none";
      if (aHasFill && bHasStroke && bFillNone && !a.node.attrs.stroke) {
        // Merge stroke from b into a's display, hide b from the printed tree.
        a.node = {
          ...a.node,
          attrs: {
            ...a.node.attrs,
            stroke: b.node.attrs.stroke,
            ...(b.node.attrs["stroke-width"]
              ? { "stroke-width": b.node.attrs["stroke-width"] }
              : {}),
          },
        };
        b.folded = true;
        a.note = `(merged stroke from [${b.index}])`;
      }
    }
  }
}

function bboxesEqual(a: Bbox, b: Bbox, tol = 0.5): boolean {
  return (
    Math.abs(a.x - b.x) <= tol &&
    Math.abs(a.y - b.y) <= tol &&
    Math.abs(a.w - b.w) <= tol &&
    Math.abs(a.h - b.h) <= tol
  );
}

// Detect "image-in-frame" sibling pairs: two adjacent rects/groups where
// the inner one references a pattern that wraps a raster, and its bbox sits
// inside the outer one. Common in Figma's image-frame layout. We annotate
// the pair with a hint so the consumer can render it as `<img>` inset.
function annotateImageFrames(entries: Entry[], svg: ParsedSvg): void {
  for (const e of entries) {
    if (!e.bbox) continue;
    const fill = e.node.attrs.fill;
    if (!fill || !fill.startsWith("url(")) continue;
    const paint = resolvePaint(fill, svg.defsById);
    if (!paint || paint.kind !== "pattern" || !paint.patternMime) continue;
    if (!e.parent || !e.parent.bbox) continue;
    const inset = Math.max(
      e.bbox.x - e.parent.bbox.x,
      e.parent.bbox.x + e.parent.bbox.w - (e.bbox.x + e.bbox.w),
      e.bbox.y - e.parent.bbox.y,
      e.parent.bbox.y + e.parent.bbox.h - (e.bbox.y + e.bbox.h),
    );
    e.parent.note = `← image-frame (inset ${Math.round(inset * 10) / 10}px, ${paint.patternMime})`;
  }
}

export function runComponents(path: string, opts: ComponentsOptions = {}): void {
  const svg = parseSvgFile(path);
  const nonDefs = svg.topChildren.filter((c) => c.tag !== "defs");

  const entries: Entry[] = nonDefs.map((node, index) => {
    const bbox = computeBbox(node);
    return { index, node, bbox, area: area(bbox), children: [], parent: null };
  });

  const initialRoots = buildContainmentTree(entries);
  const { roots, elided } = flattenPassthroughRoots(initialRoots, canvasArea(svg));
  annotateImageFrames(entries, svg);
  foldFillStrokeSiblings(entries);

  console.log(
    `Containment tree (parent = smallest earlier element fully enclosing child):`,
  );
  console.log();
  for (const e of elided) {
    console.log(
      `note: skipped passthrough container [${e.index}] ${e.node.tag} ${fmtBbox(e.bbox)} (spans full canvas)`,
    );
  }
  if (elided.length > 0) console.log();
  const resolvePaintsOpt = !!opts.resolvePaints;
  for (const r of roots) printTree(r, svg, resolvePaintsOpt);

  const clustered = entries.filter((e) => e.parent !== null).length;
  const topLevel = roots.length;
  console.log();
  console.log(
    `Summary: ${topLevel} top-level component(s), ${clustered} nested element(s).`,
  );
}
