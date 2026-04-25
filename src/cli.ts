import { Command } from "commander";
import { runTree } from "./commands/tree.js";
import { runGet } from "./commands/get.js";
import { runAnalyze } from "./commands/analyze.js";
import { runComponents } from "./commands/components.js";
import { runAt } from "./commands/at.js";

const program = new Command();

program
  .name("svq")
  .description("Inspect SVG files layer-by-layer for LLM-driven UI generation.")
  .version("0.1.0");

program
  .command("tree <file>")
  .description("List top-level elements with bbox, fill, refs, and size.")
  .option("--resolve-paints", "expand url(#…) fills/strokes to inline color summaries")
  .action((file: string, opts: Record<string, boolean>) => {
    runTree(file, { resolvePaints: opts.resolvePaints });
  });

program
  .command("get <file> <index>")
  .description("Extract element(s) as a standalone SVG. Index can be N or A..B.")
  .option("--crop", "shrink viewBox to the element bbox")
  .option("--digest", "replace long path d attributes with a summary")
  .option("--bbox <x,y,w,h>", "only include elements intersecting this region")
  .option("--out <path>", "write output to a file instead of stdout")
  .action((file: string, indexSpec: string, opts: Record<string, string | boolean>) => {
    runGet(
      file,
      indexSpec,
      opts as { crop?: boolean; digest?: boolean; bbox?: string; out?: string },
    );
  });

program
  .command("at <file> <point>")
  .description("List elements whose bbox contains the point (format: x,y).")
  .action((file: string, point: string) => {
    runAt(file, point);
  });

program
  .command("analyze <file>")
  .description("Summarize design tokens: colors, radii, strokes, gradients, text.")
  .action((file: string) => {
    runAnalyze(file);
  });

program
  .command("components <file>")
  .description("Infer component structure via spatial containment.")
  .option("--resolve-paints", "expand url(#…) fills/strokes to inline color summaries")
  .action((file: string, opts: Record<string, boolean>) => {
    runComponents(file, { resolvePaints: opts.resolvePaints });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
