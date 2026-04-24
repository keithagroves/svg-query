import type { SvgNode } from "./types.js";

const URL_REF = /url\(#([^)"\s]+)\)/g;
const HREF_ATTRS = new Set(["href", "xlink:href"]);

export function collectRefs(node: SvgNode, out: Set<string>): void {
  for (const [k, v] of Object.entries(node.attrs)) {
    if (HREF_ATTRS.has(k) && typeof v === "string" && v.startsWith("#")) {
      out.add(v.slice(1));
      continue;
    }
    if (typeof v === "string" && v.includes("url(")) {
      let m: RegExpExecArray | null;
      URL_REF.lastIndex = 0;
      while ((m = URL_REF.exec(v)) !== null) out.add(m[1]);
    }
  }
  for (const c of node.children) collectRefs(c, out);
}

export function resolveDefsClosure(
  seeds: Iterable<string>,
  defsById: Map<string, SvgNode>,
): { ids: Set<string>; nodes: SvgNode[] } {
  const ids = new Set<string>();
  const queue: string[] = [...seeds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (ids.has(id)) continue;
    const node = defsById.get(id);
    if (!node) continue;
    ids.add(id);
    const nested = new Set<string>();
    collectRefs(node, nested);
    for (const n of nested) if (!ids.has(n)) queue.push(n);
  }
  const nodes: SvgNode[] = [];
  for (const id of ids) {
    const n = defsById.get(id);
    if (n) nodes.push(n);
  }
  return { ids, nodes };
}
