import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { collectRefs, resolveDefsClosure } from "../src/refs.js";
import type { SvgNode } from "../src/types.js";

const node = (tag: string, attrs: Record<string, string>, children: SvgNode[] = []): SvgNode => ({
  tag,
  attrs,
  children,
});

describe("refs.collectRefs", () => {
  it("finds url(#id) in attrs", () => {
    const refs = new Set<string>();
    collectRefs(node("rect", { fill: "url(#grad1)" }), refs);
    assert.deepEqual([...refs], ["grad1"]);
  });

  it("finds multiple refs in different attrs", () => {
    const refs = new Set<string>();
    collectRefs(
      node("rect", { fill: "url(#a)", stroke: "url(#b)", filter: "url(#c)" }),
      refs,
    );
    assert.deepEqual(new Set([...refs]), new Set(["a", "b", "c"]));
  });

  it("finds href references", () => {
    const refs = new Set<string>();
    collectRefs(node("use", { href: "#sym1" }), refs);
    assert.deepEqual([...refs], ["sym1"]);
  });

  it("finds xlink:href references", () => {
    const refs = new Set<string>();
    collectRefs(node("use", { "xlink:href": "#sym2" }), refs);
    assert.deepEqual([...refs], ["sym2"]);
  });

  it("recurses into children", () => {
    const refs = new Set<string>();
    collectRefs(
      node("g", {}, [
        node("rect", { fill: "url(#inner)" }),
        node("g", {}, [node("circle", { stroke: "url(#deep)" })]),
      ]),
      refs,
    );
    assert.deepEqual(new Set([...refs]), new Set(["inner", "deep"]));
  });

  it("ignores non-ref attributes with `url(` text", () => {
    // Only valid url(#id) patterns should match; bare url(...) without # is ignored.
    const refs = new Set<string>();
    collectRefs(node("rect", { fill: "url(image.png)" }), refs);
    assert.equal(refs.size, 0);
  });
});

describe("refs.resolveDefsClosure", () => {
  it("returns only referenced defs", () => {
    const g1 = node("linearGradient", { id: "g1" }, [
      node("stop", { id: "s1", offset: "0", "stop-color": "red" }),
    ]);
    const g2 = node("linearGradient", { id: "g2" }, []);
    const defsById = new Map<string, SvgNode>([
      ["g1", g1],
      ["s1", g1.children[0]],
      ["g2", g2],
    ]);
    const { ids, nodes } = resolveDefsClosure(["g1"], defsById);
    assert.ok(ids.has("g1"));
    assert.ok(!ids.has("g2"));
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].attrs.id, "g1");
  });

  it("traces transitive refs (def referencing another def)", () => {
    const filter = node("filter", { id: "f1" }, [
      node("feGaussianBlur", { in: "SourceGraphic" }),
    ]);
    const gradient = node("linearGradient", { id: "g1", filter: "url(#f1)" }, []);
    const defsById = new Map<string, SvgNode>([
      ["f1", filter],
      ["g1", gradient],
    ]);
    const { ids } = resolveDefsClosure(["g1"], defsById);
    assert.ok(ids.has("g1"));
    assert.ok(ids.has("f1"), "should transitively include filter");
  });

  it("handles unknown seed ids gracefully", () => {
    const { ids, nodes } = resolveDefsClosure(["nope"], new Map());
    assert.equal(ids.size, 0);
    assert.equal(nodes.length, 0);
  });
});
