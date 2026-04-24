export type SvgNode = {
  tag: string;
  attrs: Record<string, string>;
  children: SvgNode[];
  text?: string;
};

export type Bbox = { x: number; y: number; w: number; h: number };

export type ParsedSvg = {
  root: SvgNode;
  rootAttrs: Record<string, string>;
  topChildren: SvgNode[];
  defs: SvgNode | null;
  defsById: Map<string, SvgNode>;
};
