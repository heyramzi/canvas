// Table geometry: column widths, and the height that follows.
// One owner, because the component, node-sizing and board-doc must agree.
// Flat numbers stay in metrics.ts.

/** 13px Satoshi. Deliberately wide: guessing narrow leaves a gap. */
const CELL_CHAR_W = 6.7;
/** px-3 on both sides of a cell. */
export const TABLE_CELL_PAD_X = 12;
/** py-2 top and bottom. */
const ROW_PAD_Y = 16;
/** One line of a cell: 13px over leading-[18px]. */
const ROW_LINE_H = 18;
/** The hairline between two rows. */
const ROW_BORDER = 1;
/** Title row: 20px line + py-2.5 + border. */
export const TABLE_HEADER_H = 41;
/** Column heads: 16px line + py-1.5 + border. */
export const TABLE_HEAD_ROW_H = 29;
/** The "no rows configured" placeholder. */
const TABLE_EMPTY_H = 56;

/** The floor. Under 9 characters a head like "Price" wraps. */
const MIN_COL_CH = 9;
/** The ceiling, so one long column cannot eat the card. */
const MAX_COL_CH = 48;

export type TableRow = { cells: string[] };

export function tableColumnCount(headers: string[], rows: TableRow[]): number {
  return Math.max(
    headers.length,
    rows.reduce((max, row) => Math.max(max, row.cells?.length ?? 0), 0),
    1,
  );
}

/** Fractions summing to 1. `explicit` is relative, so [1,1,3] and [10,10,30]
 *  are one split. Otherwise the content decides. */
export function tableColumnWeights(
  headers: string[],
  rows: TableRow[],
  explicit?: number[],
): number[] {
  const count = tableColumnCount(headers, rows);

  if (explicit && explicit.length === count && explicit.every((w) => w > 0)) {
    return normalize(explicit);
  }

  const natural = Array.from({ length: count }, (_, i) => {
    const head = headers[i]?.length ?? 0;
    const body = rows.reduce((max, row) => Math.max(max, row.cells?.[i]?.length ?? 0), 0);
    return Math.min(MAX_COL_CH, Math.max(MIN_COL_CH, head, body));
  });

  return normalize(natural);
}

/** `minmax(0, …)`, not a bare `fr`: a long cell must not widen its column. */
export function tableGridTemplate(weights: number[]): string {
  return weights.map((w) => `minmax(0, ${w.toFixed(4)}fr)`).join(" ");
}

/** Figure columns get `tabular-nums`. Not right-aligned: a table node is read
 *  across, and a right-aligned middle column opens a gutter mid-sentence. */
export function tableNumericColumns(rows: TableRow[], count: number): boolean[] {
  return Array.from({ length: count }, (_, i) => {
    const values = rows.map((row) => row.cells?.[i]?.trim() ?? "").filter(Boolean);
    return values.length > 0 && values.every(isFigure);
  });
}

/** A price, a count, a percentage, a multiplier. Not "$20 a month". */
function isFigure(value: string): boolean {
  return /^[-+]?[$€£]?\s?\d[\d\s.,]*\s?[%x×]?$/.test(value);
}

/** How many lines a cell takes at the width its column gets. */
function wrappedLines(text: string, columnWidth: number): number {
  const inner = Math.max(CELL_CHAR_W, columnWidth - TABLE_CELL_PAD_X * 2);
  const perLine = Math.max(1, Math.floor(inner / CELL_CHAR_W));
  return Math.max(1, Math.ceil(text.length / perLine));
}

/** The card's height at a given width, wrapping included. */
export function tableHeight(
  headers: string[],
  rows: TableRow[],
  width: number,
  explicit?: number[],
): number {
  const head = headers.length > 0 ? TABLE_HEAD_ROW_H : 0;
  if (rows.length === 0) return TABLE_HEADER_H + head + TABLE_EMPTY_H;

  const weights = tableColumnWeights(headers, rows, explicit);
  // The two vertical borders of the card itself.
  const inner = Math.max(weights.length * MIN_COL_CH * CELL_CHAR_W, width - 2);

  const body = rows.reduce((total, row) => {
    const lines = weights.reduce(
      (max, weight, i) => Math.max(max, wrappedLines(row.cells?.[i] ?? "", inner * weight)),
      1,
    );
    return total + ROW_PAD_Y + lines * ROW_LINE_H + ROW_BORDER;
  }, 0);

  return TABLE_HEADER_H + head + body;
}

function normalize(weights: number[]): number[] {
  const total = weights.reduce((sum, w) => sum + w, 0);
  return total > 0 ? weights.map((w) => w / total) : weights.map(() => 1 / weights.length);
}

// =========================
// COMPARE
// =========================

export type CompareRow = {
  labelA?: string;
  labelB?: string;
  note?: string;
  isSection?: boolean;
  depth?: number;
};

/** A section band: 11px caps over a 16px line + py-1.5 + border. */
const SECTION_ROW_H = 29;
/** A note under a row: 11px over a 16px line. */
const NOTE_LINE_H = 16;
/** Indent per depth step in a parallel column. */
export const COMPARE_DEPTH_INDENT = 16;

/** The two sides share the card by content, the same rule a table uses. */
export function compareColumnWeights(titleA: string, titleB: string, rows: CompareRow[]): number[] {
  return tableColumnWeights(
    [titleA, titleB],
    rows
      .filter((row) => !row.isSection)
      .map((row) => ({ cells: [row.labelA ?? "", row.labelB ?? ""] })),
  );
}

function compareRowHeight(
  row: CompareRow,
  texts: string[],
  widths: number[],
  full: number,
): number {
  if (row.isSection) return SECTION_ROW_H;
  const lines = texts.reduce((max, text, i) => Math.max(max, wrappedLines(text, widths[i])), 1);
  const note = row.note ? wrappedLines(row.note, full) * NOTE_LINE_H : 0;
  return ROW_PAD_Y + lines * ROW_LINE_H + ROW_BORDER + note;
}

/** What a compare card's height depends on, besides its width. */
export type CompareCard = {
  titleA: string;
  titleB: string;
  rows: CompareRow[];
  layout: "paired" | "parallel";
};

/** The compare card's height at a given width, wrapping included. */
export function compareHeight(
  { titleA, titleB, rows, layout }: CompareCard,
  width: number,
): number {
  if (rows.length === 0) return TABLE_HEADER_H + TABLE_HEAD_ROW_H + TABLE_EMPTY_H;
  const inner = Math.max(2 * MIN_COL_CH * CELL_CHAR_W, width - 2);

  if (layout === "parallel") {
    const half = inner / 2;
    const column = (side: "labelA" | "labelB") =>
      rows
        .filter((row) => row[side])
        .reduce((sum, row) => {
          const indent = (row.depth ?? 0) * COMPARE_DEPTH_INDENT;
          return sum + compareRowHeight(row, [row[side] ?? ""], [half - indent], half);
        }, 0);
    return TABLE_HEADER_H + TABLE_HEAD_ROW_H + Math.max(column("labelA"), column("labelB"));
  }

  const widths = compareColumnWeights(titleA, titleB, rows).map((w) => inner * w);
  const body = rows.reduce(
    (sum, row) => sum + compareRowHeight(row, [row.labelA ?? "", row.labelB ?? ""], widths, inner),
    0,
  );
  return TABLE_HEADER_H + TABLE_HEAD_ROW_H + body;
}
