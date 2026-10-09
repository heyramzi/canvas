import { describe, expect, it } from "vitest";
import type { CanvasNode } from "#src/types.js";
import { diagramBounds, fitViewport } from "#src/headless/fit-viewport.js";

function node(id: string, x: number, y: number, size?: Partial<CanvasNode>): CanvasNode {
  return { id, position: { x, y }, data: {}, ...size } as CanvasNode;
}

describe("diagramBounds", () => {
  it("spans every top-level node, size read off the style object", () => {
    const bounds = diagramBounds([
      node("a", 0, 0, { style: { width: 520, height: 1484 } }),
      node("b", 1600, 0, { style: { width: 460, height: 446 } }),
    ]);
    expect(bounds).toEqual({ x: 0, y: 0, width: 2060, height: 1484 });
  });

  it("ignores children, whose positions are relative to their parent", () => {
    const bounds = diagramBounds([
      node("parent", 0, 0, { style: { width: 500, height: 500 } }),
      node("child", 20, 20, { parentId: "parent", style: { width: 460, height: 200 } }),
    ]);
    expect(bounds).toEqual({ x: 0, y: 0, width: 500, height: 500 });
  });

  it("returns null when there is nothing to frame", () => {
    expect(diagramBounds([])).toBeNull();
  });
});

describe("fitViewport", () => {
  it("scales to the tighter axis and centres what is left over", () => {
    const nodes = [node("a", 0, 0, { style: { width: 1000, height: 500 } })];
    const viewport = fitViewport(nodes, { width: 500, height: 500 }, 0);

    expect(viewport?.zoom).toBe(0.5);
    expect(viewport?.x).toBe(0);
    // 500 tall at zoom 0.5 is 250, so 125 of slack above and below.
    expect(viewport?.y).toBe(125);
  });

  it("pulls a negative origin back into frame", () => {
    const nodes = [node("a", -280, 120, { style: { width: 1000, height: 500 } })];
    const viewport = fitViewport(nodes, { width: 1000, height: 500 }, 0);

    expect(viewport?.zoom).toBe(1);
    expect(viewport?.x).toBe(280);
    expect(viewport?.y).toBe(-120);
  });

  it("honours padding as a fraction of the container", () => {
    const nodes = [node("a", 0, 0, { style: { width: 1000, height: 1000 } })];
    expect(fitViewport(nodes, { width: 500, height: 500 }, 0.1)?.zoom).toBeCloseTo(0.4);
  });

  it("returns null when the container has no size yet", () => {
    const nodes = [node("a", 0, 0, { style: { width: 100, height: 100 } })];
    expect(fitViewport(nodes, { width: 0, height: 0 })).toBeNull();
  });
});
