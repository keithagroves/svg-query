import { parseSvgFile } from "../parser.js";
import { computeBbox } from "../bbox.js";
import { collectRefs } from "../refs.js";
import { classifyElement, digestPath } from "../digest.js";
import { fmtBbox, fmtSize } from "../format.js";
import type { SvgNode } from "../types.js";

function describeFill(node: SvgNode): string {
  const f = node.attrs.fill;
  if (!f || f === "none") return "";
  if (f.startsWith("url(")) return f;
  return f;
}

function summarizeDefs(defs: SvgNode): string {
  const counts = new Map<string, number>();
  for (const c of defs.children) {
    if (c.tag === "#text") continue;
    counts.set(c.tag, (counts.get(c.tag) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [tag, n] of counts) parts.push(`${n} ${tag}`);
  return parts.join(", ");
}

export function runTree(path: string): void {
  const svg = parseSvgFile(path);
  const w = svg.rootAttrs.width ?? "?";
  const h = svg.rootAttrs.height ?? "?";
  const vb = svg.rootAttrs.viewBox ? ` viewBox=${svg.rootAttrs.viewBox}` : "";
  console.log(`svg ${w}×${h}${vb}`);

  const nonDefs = svg.topChildren.filter((c) => c.tag !== "defs");
  for (let i = 0; i < nonDefs.length; i++) {
    const node = nonDefs[i];
    const isLast = i === nonDefs.length - 1 && !svg.defs;
    const prefix = isLast ? "└─" : "├─";
    const kind = classifyElement(node);
    const bbox = fmtBbox(computeBbox(node));
    const id = node.attrs.id ? ` id=${node.attrs.id}` : "";
    const fill = describeFill(node);
    const fillStr = fill ? ` fill=${fill}` : "";

    let extra = "";
    if (node.tag === "path" && node.attrs.d) {
      const dg = digestPath(node.attrs.d);
      if (dg) extra = ` d=${fmtSize(dg.dLength)} subpaths=${dg.subpathCount}`;
    }

    const refs = new Set<string>();
    collectRefs(node, refs);
    const refStr = refs.size > 0 ? ` refs=[${[...refs].join(",")}]` : "";

    console.log(
      `${prefix} [${String(i).padStart(2)}] ${kind.padEnd(16)} ${bbox}${fillStr}${id}${extra}${refStr}`,
    );
  }
  if (svg.defs) {
    console.log(`└─ defs (${summarizeDefs(svg.defs)})`);
  }
}
