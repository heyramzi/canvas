import { describe, expect, it } from "vitest";
import { bestAnchors, sideDetour, type Rect } from "#src/headless/edge-anchors.js";

const box = (x: number, y: number): Rect => ({ x, y, width: 200, height: 80 });

describe("bestAnchors", () => {
  it("joins stacked boxes down the right, never through the middle", () => {
    const { source, target } = bestAnchors(box(0, 0), box(20, 300));
    expect([source.side, target.side]).toEqual(["right", "right"]);
    expect(source.x).toBe(200);
    expect(source.y).toBe(40);
    expect(target.x).toBe(220);
    expect(target.y).toBe(340);
  });

  it("joins stacked boxes down the left when the right margin is smaller", () => {
    const wide: Rect = { x: 0, y: 0, width: 300, height: 80 };
    const narrow: Rect = { x: 200, y: 300, width: 80, height: 80 };
    const { source, target } = bestAnchors(wide, narrow);
    expect([source.side, target.side]).toEqual(["left", "left"]);
    expect(source.x).toBe(0);
    expect(target.x).toBe(200);
  });

  it("stays right on ties and partial overlaps", () => {
    const tied = bestAnchors(box(0, 300), box(0, 0));
    expect([tied.source.side, tied.target.side]).toEqual(["right", "right"]);
    const partial = bestAnchors(box(0, 0), box(100, 300));
    expect([partial.source.side, partial.target.side]).toEqual(["right", "right"]);
  });

  it("meets right to left when the target is beside it", () => {
    const { source, target } = bestAnchors(box(0, 0), box(500, 30));
    expect([source.side, target.side]).toEqual(["right", "left"]);
    expect(source.x).toBe(200);
    expect(source.y).toBe(40);
    expect(target.x).toBe(500);
  });

  it("meets left to right when the target is to the left", () => {
    const { source, target } = bestAnchors(box(500, 0), box(0, 0));
    expect([source.side, target.side]).toEqual(["left", "right"]);
  });

  it("takes the axis with the wider gap, not the wider centre offset", () => {
    // 240px apart sideways, 400px apart vertically: the column wins.
    const { source } = bestAnchors(box(0, 0), box(440, 480));
    expect(source.side).toBe("bottom");
  });

  it("joins overlapping boxes by the side, not through the middle", () => {
    const { source, target } = bestAnchors(box(0, 0), box(10, 10));
    expect([source.side, target.side]).toEqual(["right", "right"]);
  });
});

describe("sideDetour", () => {
  it("runs past the further right edge, plus the margin", () => {
    const anchors = bestAnchors(box(0, 0), box(20, 300));
    expect(sideDetour(anchors)).toBe(260);
    expect(sideDetour(anchors, 10)).toBe(230);
  });

  it("runs past the further left edge, minus the margin", () => {
    const wide: Rect = { x: 0, y: 0, width: 300, height: 80 };
    const narrow: Rect = { x: 200, y: 300, width: 80, height: 80 };
    expect(sideDetour(bestAnchors(wide, narrow))).toBe(-40);
  });
});
