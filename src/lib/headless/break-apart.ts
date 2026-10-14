// Break apart: a drawn figure's cards become real cards. Pure over a parsed tree, so a
// browser, a CLI and a server run the same code.

import type { CanvasOp } from "#src/ops/ops.js";
import { SKETCH_ACCENTS, sketchColors } from "#src/headless/sketch.js";
import { sanitizeFigureSvg } from "#src/headless/svg-figure.js";
import { PEN_HEX } from "#src/pen/colors.js";
import type { PenColor } from "#src/pen/types.js";

// =========================
// TYPES
// =========================

/** One SVG element. Text between tags is a plain string child. */
export type FigureEl = { tag: string; attrs: Record<string, string>; children: FigureChild[] };
export type FigureChild = FigureEl | string;

/** What the tree reader needs from a DOM node, so no global `Element` is named here. */
export type DomLike = {
  nodeType: number;
  localName?: string;
  textContent: string | null;
  attributes?: ArrayLike<{ name: string; value: string }>;
  childNodes?: ArrayLike<DomLike>;
};

export type BreakApartInput = {
  /** The figure node as the board holds it. */
  node: {
    id: string;
    position: { x: number; y: number };
    width?: number;
    parentId?: string;
    data: Record<string, unknown>;
  };
  /** The parsed `<svg>` root of the figure's markup, unsanitized: `data-pins` is read from it. */
  tree: FigureEl;
  /** Where the drawing sits inside the node box, in board px. Measured in a browser; headless callers omit it. */
  art?: { left: number; top: number; width: number };
  /** Ids already on the board, so a new card never reuses one. */
  takenIds?: ReadonlySet<string>;
  /** The look every new link starts with (the app's `NEW_EDGE_STYLE`). */
  edgeData?: Record<string, unknown>;
};

export type BreakApartResult = {
  ops: CanvasOp[];
  cards: number;
  edges: number;
  /** Bare rectangles and number marks that became shapes. */
  shapes: number;
  /** Rectangles drawn round cards that became frames. */
  frames: number;
  /** The figure stays, smaller, because it still has panels or chrome. */
  remains: boolean;
};

type Box = { x1: number; y1: number; x2: number; y2: number };
type Pt = { x: number; y: number };

type Found = {
  group: FigureEl;
  offset: Pt;
  rect: FigureEl;
  box: Box;
  claimed: Set<FigureChild>;
  title: string;
  kicker?: string;
  body: string[];
  /** The font size the title was drawn at, in drawing units. */
  titleSize: number;
};

// =========================
// CONSTANTS
// =========================

/** The heading above the drawing; mirrors LABEL_H in svg-figure.ts. */
const LABEL_H = 27;
/** A group with more text than this is a panel, not a card. */
const MAX_CARD_TEXTS = 8;
/** Smaller than this share of the drawing, or it is a panel. */
const MAX_CARD_AREA = 0.4;
/** How far an arrow end may sit from a card edge and still land on it, in drawing units. */
const LAND_TOLERANCE = 8;
const ARROWHEAD_MAX = 20;
const FALLBACK_FONT = 16;
/** A note's type and spacing in px (sketch-note.svelte), for estimating how tall a card sets. */
const NOTE_TITLE_PX = 19;
const NOTE_BODY_PX = 15;
const NOTE_TITLE_LINE = 26;
const NOTE_BODY_LINE = 21.75;
const NOTE_PAD_X = 40;
const NOTE_PAD_Y = 32;
const NOTE_GAP = 10;
/** Average glyph width as a share of the type size. */
const NOTE_GLYPH = 0.55;
const NOTE_GLYPH_CAPS = 0.7;
/** Aim a little under the drawn height, since the estimate wraps by character count. */
const FIT_MARGIN = 0.92;

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

// =========================
// TREE
// =========================

/** Read a DOM element (or any node shaped like one) into a tree. */
export function treeFromElement(el: DomLike): FigureEl {
  const attrs: Record<string, string> = {};
  for (const attr of Array.from(el.attributes ?? [])) attrs[attr.name] = attr.value;
  const children: FigureChild[] = [];
  for (const child of Array.from(el.childNodes ?? [])) {
    if (child.nodeType === TEXT_NODE) children.push(child.textContent ?? "");
    else if (child.nodeType === ELEMENT_NODE) children.push(treeFromElement(child));
  }
  return { tag: el.localName ?? "", attrs, children };
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function serialize(child: FigureChild): string {
  if (typeof child === "string") return escapeText(child);
  const attrs = Object.entries(child.attrs)
    .map(([name, value]) => ` ${name}="${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`)
    .join("");
  return `<${child.tag}${attrs}>${child.children.map(serialize).join("")}</${child.tag}>`;
}

function isEl(child: FigureChild): child is FigureEl {
  return typeof child !== "string";
}

// =========================
// GEOMETRY
// =========================

function num(value: string | undefined, fallback = 0): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** `translate(a b)` and nothing else. Any other transform makes the geometry unreadable: null. */
function translateOf(el: FigureEl): Pt | null {
  const raw = el.attrs.transform?.trim();
  if (!raw) return { x: 0, y: 0 };
  const match = raw.match(/^translate\(\s*(-?[\d.]+)[\s,]*(-?[\d.]+)?\s*\)$/);
  return match ? { x: Number(match[1]), y: Number(match[2] ?? 0) } : null;
}

function union(a: Box | null, b: Box | null): Box | null {
  if (!a) return b;
  if (!b) return a;
  return {
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
    x2: Math.max(a.x2, b.x2),
    y2: Math.max(a.y2, b.y2),
  };
}

function boxOf(points: Pt[]): Box | null {
  if (points.length === 0) return null;
  return {
    x1: Math.min(...points.map((p) => p.x)),
    y1: Math.min(...points.map((p) => p.y)),
    x2: Math.max(...points.map((p) => p.x)),
    y2: Math.max(...points.map((p) => p.y)),
  };
}

function within(inner: Box, outer: Box, tolerance = 1): boolean {
  return (
    inner.x1 >= outer.x1 - tolerance &&
    inner.y1 >= outer.y1 - tolerance &&
    inner.x2 <= outer.x2 + tolerance &&
    inner.y2 <= outer.y2 + tolerance
  );
}

function contains(box: Box, point: Pt, tolerance: number): boolean {
  return (
    point.x >= box.x1 - tolerance &&
    point.x <= box.x2 + tolerance &&
    point.y >= box.y1 - tolerance &&
    point.y <= box.y2 + tolerance
  );
}

/** The vertices a path passes through. Curve control points are skipped: the ends bound it well enough. */
function pathPoints(d: string): Pt[] {
  const out: Pt[] = [];
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  // Numbers per command, and which of them are the end point's x and y.
  const arity: Record<string, number> = {
    M: 2,
    L: 2,
    H: 1,
    V: 1,
    C: 6,
    S: 4,
    Q: 4,
    T: 2,
    A: 7,
    Z: 0,
  };
  for (const part of d.matchAll(/([a-zA-Z])([^a-zA-Z]*)/g)) {
    const cmd = part[1];
    const upper = cmd.toUpperCase();
    const size = arity[upper];
    if (size === undefined) continue;
    const rel = cmd !== upper;
    const nums = (part[2].match(/-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/gi) ?? []).map(Number);
    if (upper === "Z") {
      cur = start;
      out.push(cur);
      continue;
    }
    for (let i = 0; i + size <= nums.length; i += size) {
      const args = nums.slice(i, i + size);
      let x = cur.x;
      let y = cur.y;
      if (upper === "H") x = rel ? cur.x + args[0] : args[0];
      else if (upper === "V") y = rel ? cur.y + args[0] : args[0];
      else {
        x = rel ? cur.x + args[size - 2] : args[size - 2];
        y = rel ? cur.y + args[size - 1] : args[size - 1];
      }
      cur = { x, y };
      if (upper === "M" && i === 0) start = cur;
      out.push(cur);
    }
  }
  return out;
}

function pointList(raw: string | undefined): Pt[] {
  const nums = (raw ?? "").match(/-?(?:\d+\.?\d*|\.\d+)/g)?.map(Number) ?? [];
  const out: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i], y: nums[i + 1] });
  return out;
}

function textLines(el: FigureEl): string[] {
  const lines: string[] = [];
  let line = "";
  const flush = () => {
    const clean = line.replace(/\s+/g, " ").trim();
    if (clean) lines.push(clean);
    line = "";
  };
  for (const child of el.children) {
    if (typeof child === "string") line += child;
    else if (child.tag === "tspan") {
      if ("dy" in child.attrs || "y" in child.attrs) flush();
      line += child.children.map((c) => (typeof c === "string" ? c : "")).join("");
    }
  }
  flush();
  return lines;
}

/** The ink a shape takes, in the figure's own units. Text is estimated: no DOM here to measure it. */
function boxOfEl(el: FigureEl, offset: Pt): Box | null {
  const shift = translateOf(el) ?? { x: 0, y: 0 };
  const at = { x: offset.x + shift.x, y: offset.y + shift.y };
  const a = el.attrs;
  let box: Box | null = null;
  switch (el.tag) {
    case "rect":
      box = {
        x1: num(a.x),
        y1: num(a.y),
        x2: num(a.x) + num(a.width),
        y2: num(a.y) + num(a.height),
      };
      break;
    case "circle":
    case "ellipse": {
      const rx = num(a.rx, num(a.r));
      const ry = num(a.ry, num(a.r));
      box = { x1: num(a.cx) - rx, y1: num(a.cy) - ry, x2: num(a.cx) + rx, y2: num(a.cy) + ry };
      break;
    }
    case "line":
      box = boxOf([
        { x: num(a.x1), y: num(a.y1) },
        { x: num(a.x2), y: num(a.y2) },
      ]);
      break;
    case "polyline":
    case "polygon":
      box = boxOf(pointList(a.points));
      break;
    case "path":
      box = boxOf(pathPoints(a.d ?? ""));
      break;
    case "text": {
      const lines = textLines(el);
      const size = num(a["font-size"], FALLBACK_FONT);
      const bold = num(a["font-weight"]) >= 600 || a["font-weight"] === "bold";
      const width = Math.max(0, ...lines.map((l) => l.length)) * size * (bold ? 0.6 : 0.55);
      const anchor = a["text-anchor"];
      const x = num(a.x);
      const left = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
      const y = num(a.y);
      box = {
        x1: left,
        y1: y - size * 0.8,
        x2: left + width,
        y2: y + size * 0.2 + Math.max(0, lines.length - 1) * size * 1.2,
      };
      break;
    }
    case "g":
    case "svg":
      for (const child of el.children) {
        if (isEl(child)) box = union(box, boxOfEl(child, { x: 0, y: 0 }));
      }
      break;
    default:
      return null;
  }
  if (!box) return null;
  return { x1: box.x1 + at.x, y1: box.y1 + at.y, x2: box.x2 + at.x, y2: box.y2 + at.y };
}

function visible(el: FigureEl): boolean {
  const fill = el.attrs.fill;
  const stroke = el.attrs.stroke;
  return (fill !== undefined && fill !== "none") || (stroke !== undefined && stroke !== "none");
}

// =========================
// FINDING CARDS
// =========================

function viewBoxOf(root: FigureEl): Box | null {
  const raw = root.attrs.viewBox ?? root.attrs.viewbox;
  if (raw) {
    const [x, y, w, h] = raw
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (w > 0 && h > 0) return { x1: x, y1: y, x2: x + w, y2: y + h };
  }
  const w = num(root.attrs.width);
  const h = num(root.attrs.height);
  return w > 0 && h > 0 ? { x1: 0, y1: 0, x2: w, y2: h } : null;
}

function hasText(el: FigureEl): boolean {
  return el.tag === "text" && textLines(el).length > 0;
}

/** A solid rect that has text standing inside it. */
function holdsText(rect: FigureEl, texts: FigureEl[], offset: Pt): Box | null {
  if (rect.tag !== "rect" || !visible(rect) || rect.attrs.fill === "none") return null;
  const box = boxOfEl(rect, offset);
  if (!box) return null;
  const hit = texts.some((t) =>
    contains(box, { x: num(t.attrs.x) + offset.x, y: num(t.attrs.y) + offset.y }, 3),
  );
  return hit ? box : null;
}

/** One card: `rect` and whatever of its group's other children stands inside it. */
function cardFromRect(
  group: FigureEl,
  kids: FigureEl[],
  rect: FigureEl,
  box: Box,
  offset: Pt,
  taken: Set<FigureChild>,
): Found | null {
  const texts = kids.filter((k) => hasText(k) && !taken.has(k));
  const claimed = new Set<FigureChild>([rect]);
  const inside = texts.filter((t) =>
    contains(box, { x: num(t.attrs.x) + offset.x, y: num(t.attrs.y) + offset.y }, 3),
  );
  if (inside.length === 0 || inside.length > MAX_CARD_TEXTS) return null;

  // A number in a dot is a pin marker, not copy: the ring that stays in the figure carries it.
  let badge: string | undefined;
  const words: FigureEl[] = [];
  for (const t of inside) {
    const line = textLines(t).join(" ");
    const dot = kids.find(
      (k) =>
        k.tag === "circle" &&
        Math.hypot(num(k.attrs.cx) - num(t.attrs.x), num(k.attrs.cy) - num(t.attrs.y)) <=
          num(k.attrs.r) + 2,
    );
    if (dot && line.length <= 2) {
      badge = line;
      claimed.add(dot);
      claimed.add(t);
    } else words.push(t);
  }
  if (words.length === 0) return null;

  const ordered = [...words].sort(
    (a, b) => num(a.attrs.y) - num(b.attrs.y) || num(a.attrs.x) - num(b.attrs.x),
  );
  const isBold = (t: FigureEl) =>
    num(t.attrs["font-weight"]) >= 600 || t.attrs["font-weight"] === "bold";
  // The title is the top bold line, not an end-pinned tag or a big count further down.
  const size = (t: FigureEl) => num(t.attrs["font-size"], FALLBACK_FONT);
  const titleEl =
    ordered.find((t) => isBold(t) && t.attrs["text-anchor"] !== "end") ??
    [...ordered].sort((a, b) => Number(isBold(b)) - Number(isBold(a)) || size(b) - size(a))[0];
  const tag = ordered.find(
    (t) =>
      t !== titleEl &&
      t.attrs["text-anchor"] === "end" &&
      Math.abs(num(t.attrs.y) - num(titleEl.attrs.y)) < 8,
  );
  // A title set over two lines (CLAUDE, then CODE) is one title: the same face, directly after.
  const titleEls = [titleEl];
  const sameFace = (t: FigureEl) =>
    size(t) === size(titleEl) &&
    isBold(t) === isBold(titleEl) &&
    t.attrs["text-anchor"] === titleEl.attrs["text-anchor"];
  for (const t of ordered.slice(ordered.indexOf(titleEl) + 1)) {
    if (t === tag || !sameFace(t)) break;
    titleEls.push(t);
  }
  const bodyEls = ordered.filter((t) => !titleEls.includes(t) && t !== tag);
  for (const t of [...titleEls, ...(tag ? [tag] : []), ...bodyEls]) claimed.add(t);

  // Same-line fragments read as one line, left to right.
  const body: string[] = [];
  let lastY = Number.NaN;
  for (const t of bodyEls) {
    const text = textLines(t).join(" ");
    if (Math.abs(num(t.attrs.y) - lastY) < 3 && body.length > 0)
      body[body.length - 1] += ` ${text}`;
    else body.push(text);
    lastY = num(t.attrs.y);
  }

  // Anything else drawn inside the card's own rect is its chrome and goes with it.
  for (const k of kids) {
    if (claimed.has(k) || taken.has(k) || k.attrs.fill === "none") continue;
    const kb = boxOfEl(k, offset);
    if (kb && within(kb, box)) claimed.add(k);
  }

  return {
    group,
    offset,
    rect,
    box,
    claimed,
    title: titleEls.map((t) => textLines(t).join(" ")).join(" "),
    titleSize: size(titleEl),
    kicker:
      [badge, tag ? textLines(tag).join(" ") : undefined].filter(Boolean).join(" · ") || undefined,
    body,
  };
}

/** Cards in one group. A `data-pins` group holds a pin per card rect; any other group is one card. */
function readCards(group: FigureEl, offset: Pt, drawing: Box): Found[] {
  const kids = group.children.filter(isEl);
  const texts = kids.filter(hasText);
  if (texts.length === 0) return [];
  const taken = new Set<FigureChild>();
  const out: Found[] = [];

  if ("data-pins" in group.attrs) {
    for (const rect of kids) {
      const box = holdsText(rect, texts, offset);
      const found = box && cardFromRect(group, kids, rect, box, offset, taken);
      if (!found) continue;
      for (const part of found.claimed) taken.add(part);
      out.push(found);
    }
    return out;
  }

  if (texts.length > MAX_CARD_TEXTS || kids.some((k) => k.tag === "g")) return [];
  for (const rect of kids) {
    const box = holdsText(rect, texts, offset);
    if (!box) continue;
    const area = (box.x2 - box.x1) * (box.y2 - box.y1);
    if (area > (drawing.x2 - drawing.x1) * (drawing.y2 - drawing.y1) * MAX_CARD_AREA) return [];
    const found = cardFromRect(group, kids, rect, box, offset, taken);
    return found ? [found] : [];
  }
  return out;
}

function findCards(el: FigureEl, offset: Pt, drawing: Box, out: Found[]) {
  for (const child of el.children) {
    if (!isEl(child) || child.tag !== "g") continue;
    const shift = translateOf(child);
    if (!shift) continue;
    const at = { x: offset.x + shift.x, y: offset.y + shift.y };
    const found = readCards(child, at, drawing);
    if (found.length > 0) out.push(...found);
    else findCards(child, at, drawing, out);
  }
}

// =========================
// LOOSE SHAPES
// =========================

/** One drawn element with its box in drawing units and the siblings it sits among. */
type Atom = {
  el: FigureEl;
  box: Box | null;
  offset: Pt;
  kids: FigureEl[];
  container: FigureEl;
  pins: boolean;
};

type Shape = { el: FigureEl; box: Box };
type Frame = { el: FigureEl; box: Box };
/** A number in a dot: a step number. */
type Badge = { circle: FigureEl; text: FigureEl; center: Pt; r: number; label: string };

type Loose = {
  cards: Found[];
  shapes: Shape[];
  frames: Frame[];
  badges: Badge[];
  /** Panels that keep their chrome in the figure. */
  panels: Box[];
};

/** A dot's number is at most this long. */
const BADGE_MAX_CHARS = 2;
const BADGE_MAX_R = 30;
/** Nothing under this on a side is a card or a shape: a rule or a speck. */
const MIN_SIDE = 4;

function flatten(container: FigureEl, offset: Pt, pins: boolean, out: Atom[]) {
  const kids = container.children.filter(isEl);
  for (const el of kids) {
    if (el.tag === "g") {
      const shift = translateOf(el);
      if (shift) {
        flatten(
          el,
          { x: offset.x + shift.x, y: offset.y + shift.y },
          pins || "data-pins" in el.attrs,
          out,
        );
      }
      continue;
    }
    if (el.tag === "defs" || el.tag === "title" || el.tag === "desc") continue;
    out.push({ el, box: boxOfEl(el, offset), offset, kids, container, pins });
  }
}

const anchorOf = (a: Atom): Pt => ({
  x: num(a.el.attrs.x) + a.offset.x,
  y: num(a.el.attrs.y) + a.offset.y,
});
const areaOf = (b: Box) => (b.x2 - b.x1) * (b.y2 - b.y1);
const centerOf = (b: Box): Pt => ({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 });

/** Loose cards, bare rectangles, frames and step numbers. A rectangle with its own text and shapes inside is a panel, so its chrome stays. */
function findLoose(
  tree: FigureEl,
  drawing: Box,
  taken: Set<FigureChild>,
  groupCards: Found[],
): Loose {
  const atoms: Atom[] = [];
  flatten(tree, { x: 0, y: 0 }, false, atoms);
  const free = atoms.filter((a) => !a.pins && a.box && !taken.has(a.el));
  const out: Loose = { cards: [], shapes: [], frames: [], badges: [], panels: [] };

  const badgeParts = new Set<FigureChild>();
  const texts = free.filter((a) => hasText(a.el));
  for (const c of free.filter((a) => a.el.tag === "circle")) {
    const r = num(c.el.attrs.r);
    if (!c.box || r <= 0 || r > BADGE_MAX_R) continue;
    const center = centerOf(c.box);
    const t = texts.find((a) => {
      const label = textLines(a.el).join(" ");
      const at = anchorOf(a);
      return (
        !badgeParts.has(a.el) &&
        label.length <= BADGE_MAX_CHARS &&
        Math.hypot(at.x - center.x, at.y - center.y) <= r + 2
      );
    });
    if (!t) continue;
    badgeParts.add(c.el);
    badgeParts.add(t.el);
    out.badges.push({ circle: c.el, text: t.el, center, r, label: textLines(t.el).join(" ") });
  }

  const words = texts.filter((a) => !badgeParts.has(a.el));
  const rects = free
    .filter((a) => a.el.tag === "rect" && visible(a.el) && a.box)
    .filter((a) => {
      const b = a.box as Box;
      return b.x2 - b.x1 >= MIN_SIDE && b.y2 - b.y1 >= MIN_SIDE;
    })
    .sort((a, b) => areaOf(b.box as Box) - areaOf(a.box as Box));
  const itemBoxes = [...rects.map((a) => a.box as Box), ...groupCards.map((c) => c.box)];

  // A line that ends on two items joins them, and a small filled tip beside it is its arrowhead.
  const connector = (a: Atom): boolean => {
    if (!["line", "polyline", "path"].includes(a.el.tag)) return false;
    const solid = a.el.attrs.fill && a.el.attrs.fill !== "none";
    if (solid) {
      return (
        a.box !== null &&
        a.box.x2 - a.box.x1 <= ARROWHEAD_MAX &&
        a.box.y2 - a.box.y1 <= ARROWHEAD_MAX
      );
    }
    const ends = strokeEnds(a.el, a.offset);
    return (
      ends !== null && ends.every((p) => itemBoxes.some((b) => contains(b, p, LAND_TOLERANCE)))
    );
  };
  const strays = free.filter(
    (a) => !["rect", "text"].includes(a.el.tag) && !badgeParts.has(a.el) && !connector(a),
  );

  const dropped = new Set<Atom>();
  const inside = (box: Box, outer: Box) => within(box, outer, 1);
  for (const x of rects) {
    if (dropped.has(x)) continue;
    const box = x.box as Box;
    const inner = rects.filter(
      (o) =>
        o !== x &&
        !dropped.has(o) &&
        inside(o.box as Box, box) &&
        areaOf(o.box as Box) < areaOf(box),
    );
    const innerBoxes = [
      ...inner.map((o) => o.box as Box),
      ...groupCards.filter((c) => inside(c.box, box)).map((c) => c.box),
    ];
    const held = (point: Pt) =>
      innerBoxes.some((b) => contains(b, point, 3)) ? false : contains(box, point, 3);
    const own = words.filter((w) => held(anchorOf(w)));
    const stray = strays.some(
      (s) => s.box && inside(s.box, box) && !innerBoxes.some((b) => inside(s.box as Box, b)),
    );

    if (innerBoxes.length === 0) {
      if (own.length === 0) {
        out.shapes.push({ el: x.el, box });
        continue;
      }
      if (areaOf(box) > areaOf(drawing) * MAX_CARD_AREA) continue;
      const found = cardFromRect(x.container, x.kids, x.el, box, x.offset, taken);
      if (found) {
        for (const part of found.claimed) taken.add(part);
        out.cards.push(found);
      }
      continue;
    }
    if (own.length > 0 || stray) {
      out.panels.push(box);
      for (const o of inner) dropped.add(o);
      continue;
    }
    if (innerBoxes.length >= 2) out.frames.push({ el: x.el, box });
    else out.shapes.push({ el: x.el, box });
  }

  // A number a card already took is not a mark of its own.
  out.badges = out.badges.filter((b) => !taken.has(b.circle) && !taken.has(b.text));
  out.badges = out.badges.filter((b) => !out.panels.some((p) => contains(p, b.center, 0)));
  return out;
}

// =========================
// ARROWS
// =========================

type Arrow = {
  el: FigureEl;
  head?: FigureEl;
  from: Pt;
  to: Pt;
  startArrow: boolean;
  endArrow: boolean;
};

function strokeEnds(el: FigureEl, offset: Pt): [Pt, Pt] | null {
  const shift = translateOf(el);
  if (!shift) return null;
  const a = el.attrs;
  let pts: Pt[] = [];
  if (el.tag === "line") {
    pts = [
      { x: num(a.x1), y: num(a.y1) },
      { x: num(a.x2), y: num(a.y2) },
    ];
  } else if (el.tag === "polyline") pts = pointList(a.points);
  else if (el.tag === "path") pts = pathPoints(a.d ?? "");
  if (pts.length < 2) return null;
  const at = { x: offset.x + shift.x, y: offset.y + shift.y };
  const first = pts[0];
  const last = pts[pts.length - 1];
  return [
    { x: first.x + at.x, y: first.y + at.y },
    { x: last.x + at.x, y: last.y + at.y },
  ];
}

/** A small filled closed path beside a line's end: the way the pin figures draw an arrowhead. */
function headNear(
  siblings: FigureChild[],
  from: number,
  ends: [Pt, Pt],
  offset: Pt,
): { el: FigureEl; end: 0 | 1 } | null {
  // Whitespace between tags is a string child, so the next element is not always the next child.
  const next = siblings.slice(from + 1).find(isEl);
  if (!next || next.tag !== "path") return null;
  if (!/z\s*$/i.test(next.attrs.d ?? "") || !next.attrs.fill || next.attrs.fill === "none")
    return null;
  const box = boxOfEl(next, offset);
  if (!box || box.x2 - box.x1 > ARROWHEAD_MAX || box.y2 - box.y1 > ARROWHEAD_MAX) return null;
  const middle = { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
  const reach = ARROWHEAD_MAX;
  const d0 = Math.hypot(middle.x - ends[0].x, middle.y - ends[0].y);
  const d1 = Math.hypot(middle.x - ends[1].x, middle.y - ends[1].y);
  if (Math.min(d0, d1) > reach) return null;
  return { el: next, end: d1 <= d0 ? 1 : 0 };
}

function collectArrows(el: FigureEl, offset: Pt, out: Arrow[]) {
  el.children.forEach((child, index) => {
    if (!isEl(child)) return;
    if (child.tag === "g") {
      const shift = translateOf(child);
      if (shift) collectArrows(child, { x: offset.x + shift.x, y: offset.y + shift.y }, out);
      return;
    }
    if (child.tag !== "path" && child.tag !== "line" && child.tag !== "polyline") return;
    if (!child.attrs.stroke || child.attrs.stroke === "none") return;
    if (child.attrs.fill && child.attrs.fill !== "none") return;
    const ends = strokeEnds(child, offset);
    if (!ends) return;
    const head = headNear(el.children, index, ends, offset);
    const startArrow = Boolean(child.attrs["marker-start"]) || head?.end === 0;
    const endArrow = Boolean(child.attrs["marker-end"]) || head?.end === 1;
    // With no head at all the line still links two cards; it just draws without a tip.
    out.push({ el: child, head: head?.el, from: ends[0], to: ends[1], startArrow, endArrow });
  });
}

function cardAt(cards: Found[], point: Pt): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  cards.forEach((card, index) => {
    if (!contains(card.box, point, LAND_TOLERANCE)) return;
    const dx = Math.max(card.box.x1 - point.x, 0, point.x - card.box.x2);
    const dy = Math.max(card.box.y1 - point.y, 0, point.y - card.box.y2);
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function sideOf(box: Box, point: Pt): "top" | "bottom" | "left" | "right" {
  const gaps = [
    ["left", Math.abs(point.x - box.x1)],
    ["right", Math.abs(point.x - box.x2)],
    ["top", Math.abs(point.y - box.y1)],
    ["bottom", Math.abs(point.y - box.y2)],
  ] as const;
  return [...gaps].sort((a, b) => a[1] - b[1])[0][0];
}

// =========================
// CARD DATA
// =========================

function channels(hex: string | undefined): [number, number, number] | null {
  const m = hex?.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (!m) return null;
  const full = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** The sketch accent nearest the rect's stroke. A grey or an unknown colour reads as ink, the default. */
function accentOf(stroke: string | undefined): string | undefined {
  const rgb = channels(stroke);
  if (!rgb) return undefined;
  const spread = Math.max(...rgb) - Math.min(...rgb);
  if (spread < 40) return undefined;
  let best: { name: string; distance: number } | null = null;
  for (const name of SKETCH_ACCENTS) {
    const target = channels(sketchColors(name).stroke);
    if (!target) continue;
    const distance = Math.hypot(...rgb.map((v, i) => v - target[i]));
    if (!best || distance < best.distance) best = { name, distance };
  }
  return best && best.name !== "ink" && best.distance < 90 ? best.name : undefined;
}

/** Card text is markdown: a stray `*` or a leading `-` would turn into formatting. */
function escapeMarkdown(line: string): string {
  return line.replace(/([\\`*_~[\]])/g, "\\$1").replace(/^([#>+-]|\d+\.)/, "\\$1");
}

// =========================
// BREAK APART
// =========================

function freshId(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

function prune(el: FigureEl, removed: Set<FigureChild>): FigureEl {
  const children: FigureChild[] = [];
  for (const child of el.children) {
    if (removed.has(child)) continue;
    if (isEl(child) && child.tag === "g") {
      const kept = prune(child, removed);
      // A group left with no shape, only whitespace, is gone.
      if (kept.children.some((c) => (isEl(c) ? true : c.trim() !== ""))) children.push(kept);
      continue;
    }
    children.push(child);
  }
  return { ...el, children };
}

/** The ink left once the cards are out: drawable shapes and text, ignoring defs. */
function leftover(el: FigureEl): Box | null {
  let box: Box | null = null;
  for (const child of el.children) {
    if (!isEl(child) || child.tag === "defs" || child.tag === "title" || child.tag === "desc")
      continue;
    if (child.tag === "g") {
      const shift = translateOf(child) ?? { x: 0, y: 0 };
      const inner = leftover(child);
      if (inner) {
        box = union(box, {
          x1: inner.x1 + shift.x,
          y1: inner.y1 + shift.y,
          x2: inner.x2 + shift.x,
          y2: inner.y2 + shift.y,
        });
      }
      continue;
    }
    box = union(box, boxOfEl(child, { x: 0, y: 0 }));
  }
  return box;
}

function hueOf([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** The pen colour whose hue is nearest, or undefined for a grey, a white or a black. */
function penColorOf(color: string | undefined): PenColor | undefined {
  const rgb = channels(color);
  if (!rgb || Math.max(...rgb) - Math.min(...rgb) < 40) return undefined;
  const hue = hueOf(rgb);
  let best: { name: PenColor; gap: number } | null = null;
  for (const name of Object.keys(PEN_HEX) as PenColor[]) {
    const target = channels(PEN_HEX[name].light);
    if (!target || name === "ink") continue;
    const diff = Math.abs(hue - hueOf(target));
    const gap = Math.min(diff, 360 - diff);
    if (!best || gap < best.gap) best = { name, gap };
  }
  return best?.name;
}

/** A solid colour, not white or paper. */
function inked(color: string | undefined): boolean {
  const rgb = channels(color);
  return Boolean(rgb) && Math.min(...(rgb as number[])) < 240;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The share a note shows at: its title at the drawn size, or smaller until the copy fits the drawn box. */
function fitScale(card: Found, matched: number, boxW: number, boxH: number): number {
  // Capitals run wide, and a word wider than the card breaks mid-word, so that counts as too tall.
  const glyph = (text: string) => (text === text.toUpperCase() ? NOTE_GLYPH_CAPS : NOTE_GLYPH);
  const lines = (text: string, px: number, inner: number) => {
    const widest = Math.max(...text.split(/\s+/).map((w) => w.length)) * px * glyph(text);
    if (widest > inner) return 99;
    return Math.max(1, Math.ceil((text.length * px * glyph(text)) / inner));
  };
  const heightAt = (z: number) => {
    const inner = Math.max(boxW / z - NOTE_PAD_X, 40);
    const title = lines([card.kicker, card.title].filter(Boolean).join(" "), NOTE_TITLE_PX, inner);
    const body = card.body.reduce((n, line) => n + lines(line, NOTE_BODY_PX, inner), 0);
    return (
      (NOTE_PAD_Y + title * NOTE_TITLE_LINE + (body ? NOTE_GAP + body * NOTE_BODY_LINE : 0)) * z
    );
  };
  let z = matched;
  for (let i = 0; i < 16 && z > 0.2 && heightAt(z) > boxH * FIT_MARGIN; i += 1) z *= 0.92;
  return Math.round(z * 1000) / 1000;
}

/** A step number sits this many drawing units from the card or arrow it numbers. */
const BADGE_REACH = 6;
const BADGE_LINK_REACH = 60;
const MARK_MIN = 24;
/** Space between the drawing and the caption set under it. */
const CAPTION_GAP = 8;

function distanceToBox(box: Box, p: Pt): number {
  return Math.hypot(
    Math.max(box.x1 - p.x, 0, p.x - box.x2),
    Math.max(box.y1 - p.y, 0, p.y - box.y2),
  );
}

function distanceToSegment(a: Pt, b: Pt, p: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ops that swap a figure for cards, links, shapes and frames, or null with none in it. The rest stays as a smaller figure. */
export function breakApartFigure(input: BreakApartInput): BreakApartResult | null {
  const { node, tree } = input;
  const drawing = viewBoxOf(tree);
  const artWidth = input.art?.width ?? node.width;
  if (!drawing || !artWidth) return null;
  const vbW = drawing.x2 - drawing.x1;
  const scale = artWidth / vbW;
  const artLeft = input.art?.left ?? 0;
  const artTop = input.art?.top ?? (node.data.label ? LABEL_H : 0);

  const groupCards: Found[] = [];
  findCards(tree, { x: 0, y: 0 }, drawing, groupCards);
  const claimed = new Set<FigureChild>();
  for (const card of groupCards) for (const part of card.claimed) claimed.add(part);
  const loose = findLoose(tree, drawing, claimed, groupCards);
  const cards = [...groupCards, ...loose.cards];
  if (cards.length + loose.shapes.length + loose.frames.length === 0) return null;

  const arrows: Arrow[] = [];
  collectArrows(tree, { x: 0, y: 0 }, arrows);

  const taken = new Set(input.takenIds ?? []);
  taken.add(node.id);
  const toBoard = (p: Pt): Pt => ({
    x: Math.round(node.position.x + artLeft + (p.x - drawing.x1) * scale),
    y: Math.round(node.position.y + artTop + (p.y - drawing.y1) * scale),
  });

  const ops: CanvasOp[] = [];
  const removed = new Set<FigureChild>();
  const cardIds = cards.map((_, i) => freshId(`${node.id}-card-${i + 1}`, taken));
  const frameIds = loose.frames.map((_, i) => freshId(`${node.id}-frame-${i + 1}`, taken));

  // The smallest frame round a box, so a card inside two frames sits in the inner one.
  const frameOf = (box: Box, self = -1): number => {
    let best = -1;
    loose.frames.forEach((frame, i) => {
      if (i === self || !within(box, frame.box, 1) || areaOf(frame.box) <= areaOf(box)) return;
      if (best < 0 || areaOf(frame.box) < areaOf(loose.frames[best].box)) best = i;
    });
    return best;
  };
  /** A position in the frame's own space, or the figure's when there is no frame. */
  const placed = (box: Box, frame: number): Pt => {
    const at = toBoard({ x: box.x1, y: box.y1 });
    if (frame < 0) return at;
    const origin = toBoard({ x: loose.frames[frame].box.x1, y: loose.frames[frame].box.y1 });
    return { x: at.x - origin.x, y: at.y - origin.y };
  };
  const parentOf = (frame: number) =>
    frame >= 0 ? { parentId: frameIds[frame] } : node.parentId ? { parentId: node.parentId } : {};
  // A shape drawn with fill alone gets the thinnest line the pen has.
  const strokeOf = (el: FigureEl) =>
    el.attrs.stroke && el.attrs.stroke !== "none"
      ? Math.max(1, Math.round(num(el.attrs["stroke-width"], 1.5) * scale))
      : 1;
  const colorOf = (el: FigureEl): PenColor =>
    (el.attrs.stroke && el.attrs.stroke !== "none" ? penColorOf(el.attrs.stroke) : undefined) ??
    penColorOf(el.attrs.fill) ??
    "ink";

  // Frames come first so what sits in them draws above.
  loose.frames.forEach((frame, i) => {
    removed.add(frame.el);
    const parent = frameOf(frame.box, i);
    const width = Math.round((frame.box.x2 - frame.box.x1) * scale);
    const height = Math.round((frame.box.y2 - frame.box.y1) * scale);
    ops.push({
      kind: "addNode",
      node: {
        id: frameIds[i],
        type: "wrapper",
        position: placed(frame.box, parent),
        data: {
          nodeType: "wrapper",
          label: "",
          frame: true,
          stroke: colorOf(frame.el),
          strokeWidth: strokeOf(frame.el),
          fill: inked(frame.el.attrs.fill) ? (penColorOf(frame.el.attrs.fill) ?? "none") : "none",
        },
        style: { width, height },
        width,
        height,
        ...parentOf(parent),
      },
    });
  });

  let shapes = 0;
  const addShape = (shape: Record<string, unknown>, box: Box, frame: number, base: string) => {
    shapes += 1;
    const width = Math.round((box.x2 - box.x1) * scale);
    const height = Math.round((box.y2 - box.y1) * scale);
    ops.push({
      kind: "addNode",
      node: {
        id: freshId(`${node.id}-${base}-${shapes}`, taken),
        type: "shape",
        position: placed(box, frame),
        data: { strokeWidth: 2, filled: false, label: "", ...shape },
        width,
        height,
        ...parentOf(frame),
      },
    });
  };

  for (const shape of loose.shapes) {
    removed.add(shape.el);
    const fill = shape.el.attrs.fill;
    addShape(
      {
        shape: "rectangle",
        color: colorOf(shape.el),
        strokeWidth: strokeOf(shape.el),
        filled: inked(fill),
        ...(inked(fill) && penColorOf(fill) ? { fill: penColorOf(fill) } : {}),
      },
      shape.box,
      frameOf(shape.box),
      "shape",
    );
  }

  const cardFrames = cards.map((card) => frameOf(card.box));

  // A step number next to a card is its badge, next to a link its label, and otherwise a mark.
  const linkLabels = new Map<Arrow, string>();
  const links: { arrow: Arrow; src: number; dst: number }[] = [];
  for (const arrow of arrows) {
    const a = cardAt(cards, arrow.from);
    const b = cardAt(cards, arrow.to);
    if (a >= 0 && b >= 0 && a !== b) links.push({ arrow, src: a, dst: b });
  }
  for (const badge of loose.badges) {
    const reach = badge.r + BADGE_REACH;
    let card = -1;
    let cardGap = Number.POSITIVE_INFINITY;
    cards.forEach((c, i) => {
      const gap = distanceToBox(c.box, badge.center);
      if (gap <= reach && gap < cardGap) {
        card = i;
        cardGap = gap;
      }
    });
    let link: Arrow | null = null;
    let linkGap = Math.max(BADGE_LINK_REACH, badge.r * 3);
    if (card < 0) {
      for (const l of links) {
        const gap = distanceToSegment(l.arrow.from, l.arrow.to, badge.center);
        if (gap < linkGap) {
          link = l.arrow;
          linkGap = gap;
        }
      }
    }
    if (card >= 0) {
      cards[card].kicker = [badge.label, cards[card].kicker].filter(Boolean).join(" · ");
    } else if (link && !linkLabels.has(link)) {
      linkLabels.set(link, badge.label);
    } else {
      const side = Math.max(Math.round(badge.r * 2 * scale), MARK_MIN);
      const at = toBoard(badge.center);
      const frame = frameOf({
        x1: badge.center.x,
        y1: badge.center.y,
        x2: badge.center.x,
        y2: badge.center.y,
      });
      const origin =
        frame < 0
          ? { x: 0, y: 0 }
          : toBoard({ x: loose.frames[frame].box.x1, y: loose.frames[frame].box.y1 });
      shapes += 1;
      ops.push({
        kind: "addNode",
        node: {
          id: freshId(`${node.id}-mark-${shapes}`, taken),
          type: "shape",
          position: {
            x: at.x - origin.x - Math.round(side / 2),
            y: at.y - origin.y - Math.round(side / 2),
          },
          data: {
            shape: "ellipse",
            color: colorOf(badge.circle),
            strokeWidth: 2,
            filled: true,
            label: badge.label,
          },
          width: side,
          height: side,
          ...parentOf(frame),
        },
      });
    }
    removed.add(badge.circle);
    removed.add(badge.text);
  }

  cards.forEach((card, i) => {
    for (const part of card.claimed) removed.add(part);
    const frame = cardFrames[i];
    const width = Math.round((card.box.x2 - card.box.x1) * scale);
    const height = Math.round((card.box.y2 - card.box.y1) * scale);
    const accent = accentOf(card.rect.attrs.stroke);
    const rx = num(card.rect.attrs.rx);
    const textScale = fitScale(card, (card.titleSize * scale) / NOTE_TITLE_PX, width, height);
    ops.push({
      kind: "addNode",
      node: {
        id: cardIds[i],
        type: "note",
        position: placed(card.box, frame),
        data: {
          nodeType: "note",
          label: card.title,
          ...(card.body.length > 0 ? { content: card.body.map(escapeMarkdown).join("\n") } : {}),
          ...(card.kicker ? { kicker: card.kicker } : {}),
          ...(accent ? { accent } : {}),
          ...(rx < 3 ? { shape: "rect" } : {}),
          userHeight: height,
          ...(Math.abs(textScale - 1) > 0.02 ? { textScale } : {}),
        },
        style: { width },
        width,
        ...parentOf(frame),
      },
    });
  });

  let edges = 0;
  for (const { arrow, src: a, dst: b } of links) {
    removed.add(arrow.el);
    if (arrow.head) removed.add(arrow.head);
    // An arrow drawn tip-first reads backwards: the link runs from the tail to the tip.
    const reversed = arrow.startArrow && !arrow.endArrow;
    const [src, dst] = reversed ? [b, a] : [a, b];
    const [srcPt, dstPt] = reversed ? [arrow.to, arrow.from] : [arrow.from, arrow.to];
    edges += 1;
    const label = linkLabels.get(arrow);
    ops.push({
      kind: "addEdge",
      edge: {
        id: freshId(`${node.id}-link-${edges}`, taken),
        source: cardIds[src],
        target: cardIds[dst],
        sourceHandle: sideOf(cards[src].box, srcPt),
        targetHandle: sideOf(cards[dst].box, dstPt),
        ...(label ? { label } : {}),
        data: {
          ...input.edgeData,
          endArrow: arrow.startArrow || arrow.endArrow,
          startArrow: arrow.startArrow && arrow.endArrow,
        },
      },
    });
  }

  const counts = { cards: cards.length, edges, shapes, frames: loose.frames.length };
  const rest = prune(tree, removed);
  const ink = leftover(rest);
  if (!ink) {
    // Nothing is left to draw: the figure goes, and its title and caption stay as text above and below the pieces.
    ops.push({ kind: "removeNode", nodeId: node.id });
    const accent = node.data.accent as string | undefined;
    const color = (Object.keys(PEN_HEX) as PenColor[]).find((c) => c === accent) ?? "ink";
    const textWidth = Math.round(artWidth);
    const words: [string, number, number][] = [
      [String(node.data.label ?? ""), NOTE_TITLE_PX, node.position.y],
      [
        String(node.data.caption ?? ""),
        NOTE_BODY_PX,
        Math.round(node.position.y + artTop + (drawing.y2 - drawing.y1) * scale + CAPTION_GAP),
      ],
    ];
    for (const [i, [text, fontSize, y]] of words.entries()) {
      if (!text) continue;
      ops.push({
        kind: "addNode",
        node: {
          id: freshId(`${node.id}-text-${i === 0 ? "title" : "caption"}`, taken),
          type: "text",
          position: { x: node.position.x, y },
          data: { text, color, fontSize, fixedWidth: true },
          width: textWidth,
          height: Math.round(fontSize * 1.4),
          ...(node.parentId ? { parentId: node.parentId } : {}),
        },
      });
    }
    return { ops, ...counts, remains: false };
  }

  // The figure keeps its height, so its caption stays under the pieces; only the sides shrink.
  const crop: Box = {
    x1: Math.max(ink.x1, drawing.x1),
    y1: drawing.y1,
    x2: Math.min(ink.x2, drawing.x2),
    y2: drawing.y2,
  };
  const cropW = crop.x2 - crop.x1;
  const cropH = crop.y2 - crop.y1;
  const markup = sanitizeFigureSvg(
    serialize({
      ...rest,
      attrs: {
        ...rest.attrs,
        viewBox: `${round1(crop.x1)} ${round1(crop.y1)} ${round1(cropW)} ${round1(cropH)}`,
      },
    }),
  );
  const width = Math.round(cropW * scale);
  const board = node.data.board as { w?: number } | undefined;
  ops.push({
    kind: "patchNode",
    nodeId: node.id,
    data: { svg: markup ?? "", ...(board?.w ? { board: { ...board, w: width } } : {}) },
    width,
    style: { width },
  });
  const shift = {
    x: Math.round(node.position.x + (crop.x1 - drawing.x1) * scale),
    y: Math.round(node.position.y + (crop.y1 - drawing.y1) * scale),
  };
  if (shift.x !== node.position.x || shift.y !== node.position.y) {
    ops.push({ kind: "moveNode", nodeId: node.id, position: shift });
  }
  return { ops, ...counts, remains: true };
}
