# svgq — svg query

A CLI for inspecting SVG files layer-by-layer, designed for LLM-driven UI generation.

Figma-style SVG exports are flat (no nested layers), often contain monster `<path>` attributes that blow through context windows, and flatten text into paths. `svgq` turns one of those files into three small, structured views an LLM can actually work with:

- **design tokens** — colors, radii, strokes, gradients, filters
- **semantic component tree** — recovered from spatial containment
- **per-region standalone sub-SVGs** — with only the `<defs>` each region actually references

## Install

```sh
# no install — just run it
npx svgq analyze design.svg

# or install globally
npm i -g svgq
svgq analyze design.svg
```

## Commands

| Command                         | What it does                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `svgq analyze <file>`           | Design tokens summary (colors, radii, strokes, gradients, filters). Warns when text is flattened to paths. |
| `svgq tree <file>`              | One-line-per-element overview: index, classification, bbox, fill, path size, defs references. |
| `svgq components <file>`        | Infers a component hierarchy from spatial containment — recovers structure Figma flattened. |
| `svgq get <file> <N\|A..B>`     | Extracts element(s) as a standalone SVG with only the defs they reference. Flags: `--crop` (shrink viewBox to bbox), `--digest` (replace huge `d` attributes with a summary). |

## Typical workflow

Hand these three outputs to an LLM (or a human) in order:

```sh
svgq analyze design.svg         # design tokens as CSS vars
svgq components design.svg      # visual hierarchy / cluster tree
svgq get design.svg 4 --crop    # pull an icon out unmodified
svgq get design.svg 1..8 --crop --digest   # whole card, compacted
```

The `--digest` flag replaces paths longer than 4KB with a summary like:

```xml
<path d="[subpaths=112 bytes=62849 likely-text]" fill="#464554" data-svgq-digest="1"/>
```

The LLM still sees the bbox, fill, and that this is probably flattened text — it just doesn't get hit with 60KB of path data.

## Example

A 178KB Figma feature-card export:

```
$ svgq analyze design.svg
Dimensions: 446 × 354
Fills: #1a1c1f ×3, #464554 ×3, #f3f3f8 ×2, #2e31b7 ×1, #e2e2e7 ×1, white ×2
Corner radii (rx): 33.2, 17.1, 9.6, 34.3
Gradients: 1 linear
⚠ Flattened text detected. Re-export with "Outline Text" off for much better UI generation.

$ svgq components design.svg
[1] rect  (1,44 443×146) fill=#F3F3F8               ← card
  [3] rect  (19,62 34×34) fill=url(#paint0_linear…) ← icon chip
    [4] icon?  (27,70 16×16) fill=white
  [5] rect  (334,62 91×19) fill=#2E31B7             ← button
    [6] text(flattened)  (343,68 73×7) fill=white
  [7] text(flattened)  (20,110 77×11) fill=#1A1C1F  ← title
  [8] text(flattened)  (19,135 366×33) fill=#464554 ← body
…

$ svgq get design.svg 1..8 --crop --digest | wc -c
1607
```

178KB → 1.6KB of self-contained, LLM-digestible context. The actual icon paths come through uncompressed (they're tiny), and flattened text regions collapse to one-line placeholders tagged with their position, size, and fill.

## Classifications

`tree` and `components` tag each element with a simple heuristic label:

- `text(flattened)` — many short subpaths in one path. The copy is unrecoverable; use placeholder text sized by the bbox and ask the user to re-export from Figma with **Outline Text** unchecked.
- `icon?` — few subpaths, small `d`. Safe to extract without `--digest` and inline as-is.
- Everything else — shows its raw tag name.

## Caveats

- **z-order = paint order**: first child is visually at the bottom, last is on top. Match this in the generated DOM (later siblings on top, or use stacking).
- **Transforms**: `translate`, `scale`, and `matrix` are supported. `rotate` and `skew` are ignored — fine for typical Figma exports but worth knowing if bboxes look off.
- **Real `<text>` elements**: rare in Figma exports, but if present, just read them directly — `svgq` focuses on the flattened case.

## License

MIT
