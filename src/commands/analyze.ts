import { parseSvgFile } from "../parser.js";
import { digestPath } from "../digest.js";
import { formatPaint, resolvePaint } from "../paints.js";
import type { SvgNode } from "../types.js";

function walkAll(nodes: SvgNode[], cb: (n: SvgNode) => void): void {
  for (const n of nodes) {
    cb(n);
    if (n.children.length > 0) walkAll(n.children, cb);
  }
}

function normalizeColor(raw: string): string | null {
  const c = raw.trim();
  if (!c || c === "none" || c.startsWith("url(")) return null;
  return c.toLowerCase();
}

export function runAnalyze(path: string): void {
  const svg = parseSvgFile(path);

  const tagCounts = new Map<string, number>();
  const fills = new Map<string, number>();
  const strokes = new Map<string, number>();
  const strokeWidths = new Map<string, number>();
  const radii = new Map<string, number>();
  const gradients = { linear: 0, radial: 0 };
  const filters: string[] = [];
  const pathStats = { text: 0, icon: 0, other: 0, bytes: 0 };
  const rasters = { count: 0, bytes: 0, mimes: new Map<string, number>() };

  walkAll(svg.topChildren, (n) => {
    if (n.tag !== "#text") tagCounts.set(n.tag, (tagCounts.get(n.tag) ?? 0) + 1);
    const a = n.attrs;
    if (a.fill) {
      const c = normalizeColor(a.fill);
      if (c) fills.set(c, (fills.get(c) ?? 0) + 1);
    }
    if (a.stroke) {
      const c = normalizeColor(a.stroke);
      if (c) strokes.set(c, (strokes.get(c) ?? 0) + 1);
    }
    if (a["stroke-width"]) {
      const sw = a["stroke-width"];
      strokeWidths.set(sw, (strokeWidths.get(sw) ?? 0) + 1);
    }
    if (a.rx) radii.set(a.rx, (radii.get(a.rx) ?? 0) + 1);
    if (n.tag === "linearGradient") gradients.linear++;
    if (n.tag === "radialGradient") gradients.radial++;
    if (n.tag === "filter") filters.push(a.id ?? "(unnamed)");
    if (n.tag === "path" && a.d) {
      const dg = digestPath(a.d);
      if (!dg) return;
      pathStats.bytes += dg.dLength;
      if (dg.likelyText) pathStats.text++;
      else if (dg.likelyIcon) pathStats.icon++;
      else pathStats.other++;
    }
    if (n.tag === "image") {
      const href = a.href ?? a["xlink:href"] ?? "";
      if (href.startsWith("data:")) {
        rasters.count++;
        rasters.bytes += href.length;
        const m = href.match(/^data:([^;,]+)/);
        const mime = m ? m[1] : "data";
        rasters.mimes.set(mime, (rasters.mimes.get(mime) ?? 0) + 1);
      }
    }
  });

  const w = svg.rootAttrs.width ?? "?";
  const h = svg.rootAttrs.height ?? "?";
  console.log(`Dimensions: ${w} × ${h}`);
  if (svg.rootAttrs.viewBox) console.log(`viewBox:    ${svg.rootAttrs.viewBox}`);
  console.log();

  console.log("Element counts:");
  for (const [tag, n] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tag.padEnd(16)} ${n}`);
  }
  console.log();

  console.log("Fills:");
  for (const [c, n] of [...fills.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.padEnd(24)} ×${n}`);
  }
  if (strokes.size > 0) {
    console.log("\nStrokes:");
    for (const [c, n] of strokes) console.log(`  ${c.padEnd(24)} ×${n}`);
  }
  if (strokeWidths.size > 0) {
    console.log("\nStroke widths:");
    for (const [sw, n] of strokeWidths) console.log(`  ${sw.padEnd(24)} ×${n}`);
  }
  if (radii.size > 0) {
    console.log("\nCorner radii (rx):");
    for (const [r, n] of radii) console.log(`  ${r.padEnd(24)} ×${n}`);
  }
  if (gradients.linear + gradients.radial > 0) {
    console.log(
      `\nGradients:   ${gradients.linear} linear, ${gradients.radial} radial`,
    );
    for (const [id, node] of svg.defsById) {
      if (node.tag !== "linearGradient" && node.tag !== "radialGradient") continue;
      const resolved = resolvePaint(`url(#${id})`, svg.defsById);
      if (!resolved) continue;
      console.log(`  ${id.padEnd(24)} ${formatPaint(resolved)}`);
    }
  }
  if (filters.length > 0) console.log(`Filters:     ${filters.join(", ")}`);

  console.log();
  console.log("Path analysis:");
  console.log(`  total d= ${(pathStats.bytes / 1024).toFixed(1)}KB`);
  console.log(`  likely flattened text: ${pathStats.text}`);
  console.log(`  likely icons:          ${pathStats.icon}`);
  console.log(`  other paths:           ${pathStats.other}`);

  if (pathStats.text > 0) {
    console.log();
    console.log(
      "⚠  Flattened text detected. In Figma, uncheck \"Outline Text\" when exporting",
    );
    console.log(
      "   to preserve <text> elements — this dramatically improves UI generation.",
    );
  }

  if (rasters.count > 0) {
    const kb = (rasters.bytes / 1024).toFixed(1);
    const mimes = [...rasters.mimes.keys()].join(", ");
    console.log();
    console.log(
      `⚠  Contains ${rasters.count} embedded bitmap(s) (~${kb}KB ${mimes}). Render via`,
    );
    console.log(
      "   <img> with the original raster, not as inline SVG — there's no vector data.",
    );
  }
}
