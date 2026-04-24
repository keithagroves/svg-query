import type { SvgNode } from "./types.js";

export type PathDigest = {
  subpathCount: number;
  dLength: number;
  likelyText: boolean;
  likelyIcon: boolean;
};

export function digestPath(d: string | undefined): PathDigest | null {
  if (!d) return null;
  const subpathCount = (d.match(/[Mm]/g) ?? []).length;
  const dLength = d.length;
  // Flattened text heuristic: many small subpaths inside one path, and d is big.
  // Icons usually have 1-6 subpaths.
  const likelyText = subpathCount >= 10 && dLength / Math.max(subpathCount, 1) < 4000;
  const likelyIcon = subpathCount > 0 && subpathCount < 10 && dLength < 4000;
  return { subpathCount, dLength, likelyText, likelyIcon };
}

export function classifyElement(node: SvgNode): string {
  if (node.tag === "path") {
    const dg = digestPath(node.attrs.d);
    if (dg?.likelyText) return "text(flattened)";
    if (dg?.likelyIcon) return "icon?";
    return "path";
  }
  return node.tag;
}
