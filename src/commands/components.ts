import { parseSvgFile } from "../parser.js";
import { computeBbox } from "../bbox.js";
import { collectRefs } from "../refs.js";
import { classifyElement, digestPath } from "../digest.js";
import { fmtBbox, bboxContains, fmtSize } from "../format.js";
import type { Bbox, SvgNode } from "../types.js";

type Entry = {
  index: number;
  node: SvgNode;
  bbox: Bbox | null;
  area: number;
  children: Entry[];
  parent: Entry | null;
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

function describe(entry: Entry): string {
  const n = entry.node;
  const kind = classifyElement(n);
  const bbox = fmtBbox(entry.bbox);
  const fill = n.attrs.fill && n.attrs.fill !== "none" ? ` fill=${n.attrs.fill}` : "";
  const stroke = n.attrs.stroke ? ` stroke=${n.attrs.stroke}` : "";
  const id = n.attrs.id ? ` id=${n.attrs.id}` : "";
  let extra = "";
  if (n.tag === "path" && n.attrs.d) {
    const dg = digestPath(n.attrs.d);
    if (dg) extra = ` d=${fmtSize(dg.dLength)}`;
  }
  const refs = new Set<string>();
  collectRefs(n, refs);
  const refStr = refs.size > 0 ? ` refs=${refs.size}` : "";
  return `[${entry.index}] ${kind.padEnd(16)} ${bbox}${fill}${stroke}${id}${extra}${refStr}`;
}

function printTree(entry: Entry, depth = 0): void {
  const indent = "  ".repeat(depth);
  console.log(`${indent}${describe(entry)}`);
  for (const c of entry.children) printTree(c, depth + 1);
}

export function runComponents(path: string): void {
  const svg = parseSvgFile(path);
  const nonDefs = svg.topChildren.filter((c) => c.tag !== "defs");

  const entries: Entry[] = nonDefs.map((node, index) => {
    const bbox = computeBbox(node);
    return { index, node, bbox, area: area(bbox), children: [], parent: null };
  });

  const roots = buildContainmentTree(entries);

  console.log(
    `Containment tree (parent = smallest earlier element fully enclosing child):`,
  );
  console.log();
  for (const r of roots) printTree(r);

  const clustered = entries.filter((e) => e.parent !== null).length;
  const topLevel = roots.length;
  console.log();
  console.log(
    `Summary: ${topLevel} top-level component(s), ${clustered} nested element(s).`,
  );
}
