# TODO

Improvement backlog for `svg-query`, distilled from real LLM-driven UI generation sessions. Grouped by workstream, ordered by priority.

## ~~P1 — Tree-collapse heuristics~~ — done

- ✅ **Single-child wrapper groups.** `parser.ts` auto-unwraps top-level `<g>` wrappers that have no rendering-affecting attrs (only `transform` is allowed; `filter`/`clip-path`/`mask`/etc. block unwrap so we don't drop their effects). Wrapper transform is pushed onto each child. Recursive.
- ✅ **Oversized containers.** `components` post-processes its tree: a single root that spans ≥85% of canvas area and has ≥5 children is elided, its children promoted to top-level. The elision is reported as a `note:` line so the skip is visible.

## ~~P1 — Raster handling~~ — done

- ✅ **Detection.** `analyze` walks for `<image>` with `data:` href, accumulates byte count + mime, prints `⚠ Contains N embedded bitmap(s) (~XKB image/png). Render via <img>...`.
- ✅ **Digest collapse.** `get --digest` summarizes long `data:` hrefs on `<image>` into `[bytes=N mime/type]` markers, preserving the element's bbox/position attrs. Same `data-svq-digest="1"` marker as the path digest.

## ~~P2 — Bbox / region filtering~~ — done

- ✅ **`svq get <file> <range> --bbox x,y,w,h`** — `--bbox` filters the index range to elements whose bbox intersects the region. Errors if the result is empty.
- ✅ **`svq at <file> <x>,<y>`** — new command. Lists every element whose bbox contains the point, sorted smallest-first so the most specific hit is on top.

## ~~P2 — Inline reference annotation~~ — done

- ✅ **Gradient stops in `analyze`.** Each gradient id is listed with its resolved stops and angle: `grad1  linear(#5758FC→#2E31B7 @0°)`. Pattern-with-image is detected as `pattern(image image/png)`.
- ✅ **`--resolve-paints` flag** on `tree` and `components`. Expands `url(#…)` fills/strokes inline to `linear(...)`/`radial(...)`/`pattern(...)`.
- ✅ **Image-frame pair detection.** `components` annotates a parent whose direct child uses a pattern-with-raster fill: `← image-frame (inset 8.5px, image/png)`.
- Resolution chases gradient `href`/`xlink:href` to inherit stops from another gradient (Figma's pattern). New module: [src/paints.ts](src/paints.ts).

## ~~P3 — Output plumbing~~ — partial

- ✅ **`get --out <path>`** — writes the SVG to a file, prints a `wrote 12.3KB → path` summary on stderr so a piped stdout stays clean.
- ⏭ **`svq query <file> "rect"` post-filter** — skipped. The saved file is a valid SVG, so `svq tree <file>` already gives a queryable listing; consumers can pipe that to grep externally. Revisit if a real session shows the indirection bites.

## ~~P3 — Sibling folding~~ — done

- ✅ `components` auto-folds an adjacent sibling pair `[N] rect fill=A` + `[N+1] rect stroke=B` (identical bbox) into one line: `[N] rect ... fill=A stroke=B  (merged stroke from [N+1])`. The folded entry is hidden from the printed tree, but its index is still reachable via `get` if needed.

## Noted, likely out of scope

- **Spec-vs-render mismatch.** A `verify <css-block>` mode that diffs Figma's pasted CSS against the SVG geometry (catches things like a missing 2px gradient stroke). Useful but a different tool.
