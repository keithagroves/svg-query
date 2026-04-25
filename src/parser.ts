import { readFileSync } from "node:fs";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import type { ParsedSvg, SvgNode } from "./types.js";

const parserOpts = {
  ignoreAttributes: false,
  attributeNamePrefix: "",
  preserveOrder: true,
  trimValues: false,
  parseAttributeValue: false,
  parseTagValue: false,
};

const builderOpts = {
  ignoreAttributes: false,
  attributeNamePrefix: "",
  preserveOrder: true,
  suppressEmptyNode: true,
  format: false,
};

type RawNode = Record<string, unknown> & { ":@"?: Record<string, string> };

function toNode(raw: RawNode): SvgNode | null {
  const keys = Object.keys(raw).filter((k) => k !== ":@");
  if (keys.length === 0) return null;
  const tag = keys[0];
  const value = raw[tag];
  const attrs = raw[":@"] ?? {};
  if (tag === "#text") {
    return { tag: "#text", attrs: {}, children: [], text: String(value ?? "") };
  }
  const children: SvgNode[] = Array.isArray(value)
    ? (value
        .map((c) => toNode(c as RawNode))
        .filter((n): n is SvgNode => n !== null))
    : [];
  return { tag, attrs: attrs as Record<string, string>, children };
}

export function parseSvgFile(path: string): ParsedSvg {
  const xml = readFileSync(path, "utf8");
  return parseSvgString(xml);
}

export function parseSvgString(xml: string): ParsedSvg {
  const parser = new XMLParser(parserOpts);
  const rawArr = parser.parse(xml) as RawNode[];

  let svgRaw: RawNode | null = null;
  for (const item of rawArr) {
    if (Object.keys(item).some((k) => k === "svg")) {
      svgRaw = item;
      break;
    }
  }
  if (!svgRaw) throw new Error("No <svg> root element found");

  const rootNode = toNode(svgRaw);
  if (!rootNode) throw new Error("Failed to parse <svg> root");

  const rootAttrs = rootNode.attrs;
  const rawTopChildren = rootNode.children.filter((c) => c.tag !== "#text");
  const topChildren = unwrapTopChildren(rawTopChildren);

  let defs: SvgNode | null = null;
  const defsById = new Map<string, SvgNode>();
  for (const c of topChildren) {
    if (c.tag === "defs") {
      defs = c;
      collectIds(c, defsById);
      break;
    }
  }
  // Also collect top-level ids in case something outside defs is referenced.
  for (const c of topChildren) {
    if (c.tag !== "defs" && c.attrs.id) defsById.set(c.attrs.id, c);
  }

  return { root: rootNode, rootAttrs, topChildren, defs, defsById };
}

// Figma exports often wrap the entire scene in a single <g> (typically with
// just a transform or no attributes at all). That wrapper hides every real
// element one level down, which makes `tree`/`components` collapse to a
// single useless line. Repeatedly unwrap while the only non-defs top-level
// element is a structurally-empty <g>, pushing the wrapper's transform down
// onto each child so geometry stays correct.
//
// Wrappers with rendering-affecting attrs — filter, clip-path, mask, opacity,
// fill/stroke, etc. — are left alone, because dropping the <g> would silently
// drop those effects (and the refs they pull into the defs closure).
const UNWRAP_SAFE_ATTRS = new Set(["transform"]);

function isSafeWrapper(node: SvgNode): boolean {
  if (node.tag !== "g") return false;
  for (const k of Object.keys(node.attrs)) {
    if (!UNWRAP_SAFE_ATTRS.has(k)) return false;
  }
  return true;
}

export function unwrapTopChildren(topChildren: SvgNode[]): SvgNode[] {
  let current = topChildren;
  while (true) {
    const nonDefs = current.filter((c) => c.tag !== "defs" && c.tag !== "#text");
    if (nonDefs.length !== 1) break;
    const wrapper = nonDefs[0];
    if (!isSafeWrapper(wrapper)) break;
    const realChildren = wrapper.children.filter((c) => c.tag !== "#text");
    if (realChildren.length === 0) break;

    const defsSiblings = current.filter((c) => c.tag === "defs");
    const wrapperT = wrapper.attrs.transform;
    const promoted = realChildren.map((c) => {
      if (!wrapperT) return c;
      const childT = c.attrs.transform;
      const combined = childT ? `${wrapperT} ${childT}` : wrapperT;
      return { ...c, attrs: { ...c.attrs, transform: combined } };
    });
    current = [...defsSiblings, ...promoted];
  }
  return current;
}

function collectIds(node: SvgNode, out: Map<string, SvgNode>): void {
  if (node.attrs.id) out.set(node.attrs.id, node);
  for (const c of node.children) collectIds(c, out);
}

function nodeToRaw(node: SvgNode): RawNode {
  if (node.tag === "#text") {
    return { "#text": node.text ?? "" };
  }
  const raw: RawNode = {
    [node.tag]: node.children.map((c) => nodeToRaw(c)),
  };
  if (Object.keys(node.attrs).length > 0) {
    raw[":@"] = node.attrs;
  }
  return raw;
}

export function serializeSvg(rootAttrs: Record<string, string>, children: SvgNode[]): string {
  const builder = new XMLBuilder(builderOpts);
  const svgRaw: RawNode = {
    svg: children.map((c) => nodeToRaw(c)),
    ":@": rootAttrs,
  };
  const xml = builder.build([svgRaw]);
  return xml as string;
}
