import { parseSvgFile } from "../parser.js";
import { computeBbox } from "../bbox.js";
import { classifyElement, digestPath } from "../digest.js";
import { fmtBbox, fmtSize, parsePointSpec, pointInBbox } from "../format.js";
import { collectRefs } from "../refs.js";

export function runAt(path: string, pointSpec: string): void {
  const { x, y } = parsePointSpec(pointSpec);
  const svg = parseSvgFile(path);
  const nonDefs = svg.topChildren.filter((c) => c.tag !== "defs");

  type Hit = { index: number; node: typeof nonDefs[number]; bbox: ReturnType<typeof computeBbox>; area: number };
  const hits: Hit[] = [];
  for (let i = 0; i < nonDefs.length; i++) {
    const node = nonDefs[i];
    const bbox = computeBbox(node);
    if (!bbox) continue;
    if (pointInBbox(x, y, bbox)) {
      hits.push({ index: i, node, bbox, area: bbox.w * bbox.h });
    }
  }

  if (hits.length === 0) {
    console.log(`No elements contain point (${x}, ${y}).`);
    return;
  }

  // Smallest first — that's the most specific element under the point.
  hits.sort((a, b) => a.area - b.area);
  console.log(`${hits.length} element(s) contain point (${x}, ${y}), smallest first:`);
  console.log();
  for (const h of hits) {
    const kind = classifyElement(h.node);
    const fill = h.node.attrs.fill && h.node.attrs.fill !== "none" ? ` fill=${h.node.attrs.fill}` : "";
    const stroke = h.node.attrs.stroke ? ` stroke=${h.node.attrs.stroke}` : "";
    const id = h.node.attrs.id ? ` id=${h.node.attrs.id}` : "";
    let extra = "";
    if (h.node.tag === "path" && h.node.attrs.d) {
      const dg = digestPath(h.node.attrs.d);
      if (dg) extra = ` d=${fmtSize(dg.dLength)}`;
    }
    const refs = new Set<string>();
    collectRefs(h.node, refs);
    const refStr = refs.size > 0 ? ` refs=[${[...refs].join(",")}]` : "";
    console.log(
      `[${h.index}] ${kind.padEnd(16)} ${fmtBbox(h.bbox)}${fill}${stroke}${id}${extra}${refStr}`,
    );
  }
}
