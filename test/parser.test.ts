import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSvgString, serializeSvg } from "../src/parser.js";

describe("parser", () => {
  it("parses root attrs and top-level children", () => {
    const xml = `<svg width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="5" height="5" fill="red"/><circle cx="7" cy="7" r="2" fill="blue"/></svg>`;
    const parsed = parseSvgString(xml);
    assert.equal(parsed.rootAttrs.width, "10");
    assert.equal(parsed.rootAttrs.viewBox, "0 0 10 10");
    assert.equal(parsed.topChildren.length, 2);
    assert.equal(parsed.topChildren[0].tag, "rect");
    assert.equal(parsed.topChildren[1].tag, "circle");
  });

  it("collects defs by id including nested ids", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g1"><stop id="s1" offset="0" stop-color="red"/></linearGradient><filter id="f1"/></defs><rect id="r1" fill="url(#g1)"/></svg>`;
    const parsed = parseSvgString(xml);
    assert.ok(parsed.defs, "defs should be found");
    assert.ok(parsed.defsById.has("g1"));
    assert.ok(parsed.defsById.has("s1"));
    assert.ok(parsed.defsById.has("f1"));
    assert.ok(parsed.defsById.has("r1"));
  });

  it("preserves element order (z-order)", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg"><rect id="a"/><rect id="b"/><rect id="c"/></svg>`;
    const parsed = parseSvgString(xml);
    assert.deepEqual(
      parsed.topChildren.map((n) => n.attrs.id),
      ["a", "b", "c"],
    );
  });

  it("round-trips through serializeSvg", () => {
    const xml = `<svg width="10" height="10" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="5" height="5" fill="red"/></svg>`;
    const parsed = parseSvgString(xml);
    const out = serializeSvg(parsed.rootAttrs, parsed.topChildren);
    const reparsed = parseSvgString(out);
    assert.equal(reparsed.topChildren.length, 1);
    assert.equal(reparsed.topChildren[0].attrs.fill, "red");
    assert.equal(reparsed.rootAttrs.width, "10");
  });

  it("unwraps a bare <g> wrapper around the whole scene", () => {
    const xml = `<svg width="10" height="10" xmlns="http://www.w3.org/2000/svg"><g><rect id="a" x="0" y="0" width="5" height="5"/><rect id="b" x="5" y="5" width="5" height="5"/></g></svg>`;
    const parsed = parseSvgString(xml);
    assert.equal(parsed.topChildren.length, 2);
    assert.deepEqual(parsed.topChildren.map((n) => n.attrs.id), ["a", "b"]);
  });

  it("pushes wrapper transform onto unwrapped children", () => {
    const xml = `<svg width="10" height="10" xmlns="http://www.w3.org/2000/svg"><g transform="translate(1,2)"><rect id="a"/><rect id="b" transform="scale(2)"/></g></svg>`;
    const parsed = parseSvgString(xml);
    assert.equal(parsed.topChildren.length, 2);
    assert.equal(parsed.topChildren[0].attrs.transform, "translate(1,2)");
    assert.equal(parsed.topChildren[1].attrs.transform, "translate(1,2) scale(2)");
  });

  it("does NOT unwrap a <g> with rendering-affecting attrs (filter/clip-path/etc.)", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg"><g filter="url(#f1)"><rect id="r"/></g><defs><filter id="f1"/></defs></svg>`;
    const parsed = parseSvgString(xml);
    const nonDefs = parsed.topChildren.filter((c) => c.tag !== "defs");
    assert.equal(nonDefs.length, 1);
    assert.equal(nonDefs[0].tag, "g");
    assert.equal(nonDefs[0].attrs.filter, "url(#f1)");
  });

  it("recursively unwraps nested bare wrappers", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg"><g><g><rect id="a"/><rect id="b"/></g></g></svg>`;
    const parsed = parseSvgString(xml);
    assert.deepEqual(parsed.topChildren.map((n) => n.attrs.id), ["a", "b"]);
  });

  it("preserves defs siblings when unwrapping", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg"><g><rect id="a"/><rect id="b"/></g><defs><linearGradient id="g1"/></defs></svg>`;
    const parsed = parseSvgString(xml);
    assert.ok(parsed.defs, "defs should still be present");
    assert.ok(parsed.defsById.has("g1"));
    const nonDefs = parsed.topChildren.filter((c) => c.tag !== "defs");
    assert.equal(nonDefs.length, 2);
  });
});
