/**
 * Which side of each box an edge leaves from and arrives at. The edge picks the
 * pair, not the author. Sides are xyflow `Position` values, handed to
 * getSmoothStepPath.
 */

export type Side = "top" | "right" | "bottom" | "left";
export type Rect = { x: number; y: number; width: number; height: number };
export type Anchor = { x: number; y: number; side: Side };

function center(rect: Rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function anchorOn(rect: Rect, side: Side): Anchor {
  const c = center(rect);
  switch (side) {
    case "top":
      return { x: c.x, y: rect.y, side };
    case "bottom":
      return { x: c.x, y: rect.y + rect.height, side };
    case "left":
      return { x: rect.x, y: c.y, side };
    case "right":
      return { x: rect.x + rect.width, y: c.y, side };
  }
}

/**
 * The pair of sides that face each other. Boxes that overlap horizontally get the
 * same vertical side, so the edge runs past them, never through them.
 */
export function bestAnchors(source: Rect, target: Rect): { source: Anchor; target: Anchor } {
  const gapX = Math.max(target.x - (source.x + source.width), source.x - (target.x + target.width));

  if (gapX <= 0) {
    const side = detourSide(source, target);
    return { source: anchorOn(source, side), target: anchorOn(target, side) };
  }

  const gapY = Math.max(
    target.y - (source.y + source.height),
    source.y - (target.y + target.height),
  );

  if (gapX > gapY) {
    const targetIsRight = center(target).x >= center(source).x;
    return {
      source: anchorOn(source, targetIsRight ? "right" : "left"),
      target: anchorOn(target, targetIsRight ? "left" : "right"),
    };
  }

  const targetIsBelow = center(target).y >= center(source).y;
  return {
    source: anchorOn(source, targetIsBelow ? "bottom" : "top"),
    target: anchorOn(target, targetIsBelow ? "top" : "bottom"),
  };
}
// Which side a same-side pair travels on: the wider overhang wins, ties go right.
function detourSide(source: Rect, target: Rect): "right" | "left" {
  const sL = source.x;
  const sR = source.x + source.width;
  const tL = target.x;
  const tR = target.x + target.width;
  if (sL <= tL && sR >= tR) {
    return sR - tR >= tL - sL ? "right" : "left";
  }
  if (tL <= sL && tR >= sR) {
    return tR - sR >= sL - tL ? "right" : "left";
  }
  return "right";
}

/**
 * The x a same-side path travels along outside both boxes. Both anchors carry
 * the box edge on their side, so the detour is one margin past the further one.
 */
export function sideDetour(anchors: { source: Anchor; target: Anchor }, margin = 40): number {
  const side = anchors.source.side;
  if (side === "left") return Math.min(anchors.source.x, anchors.target.x) - margin;
  return Math.max(anchors.source.x, anchors.target.x) + margin;
}

/** The outline an arrow binds to: a box, or the ellipse drawn round it at `rx`, `ry`. */
export type Outline = { cx: number; cy: number; rx: number; ry: number; round: boolean };

/** Where the line from this outline's centre toward `toward` crosses the outline, `gap` further out. */
export function outlinePoint(o: Outline, toward: { x: number; y: number }, gap = 0) {
  const dx = toward.x - o.cx;
  const dy = toward.y - o.cy;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: o.cx, y: o.cy };
  const t = o.round
    ? 1 / Math.hypot(dx / o.rx, dy / o.ry)
    : Math.min(
        dx === 0 ? Infinity : o.rx / Math.abs(dx),
        dy === 0 ? Infinity : o.ry / Math.abs(dy),
      );
  const reach = t * len + gap;
  return { x: o.cx + (dx / len) * reach, y: o.cy + (dy / len) * reach };
}
