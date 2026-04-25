import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSvgString } from "../src/parser.js";
import { formatPaint, resolvePaint } from "../src/paints.js";

describe("paints.resolvePaint", () => {
  it("resolves a linear gradient with two stops", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g1" x1="0" y1="0" x2="10" y2="0"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs><rect/></svg>`;
    const parsed = parseSvgString(xml);
    const r = resolvePaint("url(#g1)", parsed.defsById);
    assert.ok(r);
    assert.equal(r!.kind, "linear");
    assert.deepEqual(
      r!.stops.map((s) => s.color),
      ["#ff0000", "#0000ff"],
    );
    assert.equal(r!.angleDeg, 0);
    assert.equal(formatPaint(r!), "linear(#ff0000→#0000ff @0°)");
  });

  it("resolves a radial gradient", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g2"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient></defs><rect/></svg>`;
    const parsed = parseSvgString(xml);
    const r = resolvePaint("url(#g2)", parsed.defsById);
    assert.equal(r!.kind, "radial");
    assert.equal(formatPaint(r!), "radial(#fff→#000)");
  });

  it("follows href chain to inherit stops", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><linearGradient id="src"><stop offset="0" stop-color="#abcdef"/><stop offset="1" stop-color="#123456"/></linearGradient><linearGradient id="ref" xlink:href="#src" x1="0" y1="0" x2="0" y2="10"/></defs><rect/></svg>`;
    const parsed = parseSvgString(xml);
    const r = resolvePaint("url(#ref)", parsed.defsById);
    assert.ok(r);
    assert.deepEqual(
      r!.stops.map((s) => s.color),
      ["#abcdef", "#123456"],
    );
  });

  it("recognizes a pattern wrapping a raster image", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><pattern id="pat"><image xlink:href="data:image/jpeg;base64,abc"/></pattern></defs><rect/></svg>`;
    const parsed = parseSvgString(xml);
    const r = resolvePaint("url(#pat)", parsed.defsById);
    assert.ok(r);
    assert.equal(r!.kind, "pattern");
    assert.equal(r!.patternMime, "image/jpeg");
    assert.equal(formatPaint(r!), "pattern(image image/jpeg)");
  });

  it("returns null for non-url() input or missing id", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`;
    const parsed = parseSvgString(xml);
    assert.equal(resolvePaint("#ff0000", parsed.defsById), null);
    assert.equal(resolvePaint("url(#nope)", parsed.defsById), null);
  });
});
