import { Command } from "commander";
import { runTree } from "./commands/tree.js";
import { runGet } from "./commands/get.js";
import { runAnalyze } from "./commands/analyze.js";
import { runComponents } from "./commands/components.js";

const program = new Command();

program
  .name("svgq")
  .description("Inspect SVG files layer-by-layer for LLM-driven UI generation.")
  .version("0.1.0");

program
  .command("tree <file>")
  .description("List top-level elements with bbox, fill, refs, and size.")
  .action((file: string) => {
    runTree(file);
  });

program
  .command("get <file> <index>")
  .description("Extract element(s) as a standalone SVG. Index can be N or A..B.")
  .option("--crop", "shrink viewBox to the element bbox")
  .option("--digest", "replace long path d attributes with a summary")
  .action((file: string, indexSpec: string, opts: Record<string, boolean>) => {
    runGet(file, indexSpec, opts);
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
  .action((file: string) => {
    runComponents(file);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
