// Stroke paths for the tool bar icons, drawn on a 24px grid. One list per icon, one path per entry.

export type IconName =
  | "select"
  | "hand"
  | "pen"
  | "highlighter"
  | "eraser"
  | "text"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "shapes"
  | "undo"
  | "redo"
  | "cards"
  | "search";

export const ICON_PATHS: Record<IconName, readonly string[]> = {
  select: ["M5 3.5 18.5 10l-5.6 1.9L10.7 17.5z"],
  hand: [
    "M8 13V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5a1.5 1.5 0 0 1 3 0V11m0-4a1.5 1.5 0 0 1 3 0v6.5a6.5 6.5 0 0 1-6.5 6.5h-.4a6 6 0 0 1-4.7-2.3L4.6 14.6a1.5 1.5 0 0 1 2.3-1.9L8 14",
  ],
  pen: ["M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z", "M14.5 6.5l3 3"],
  highlighter: ["M14.5 4.5l5 5-8 8-5 1.5 1-5z", "M4 21h16"],
  eraser: [
    "M4.5 15l8.5-8.5a2.1 2.1 0 0 1 3 0l3 3a2.1 2.1 0 0 1 0 3L12 20H8z",
    "M10.5 9l6 6M12 20h8",
  ],
  text: ["M5 7V5.5h14V7M12 5.5V19M9 19h6"],
  rectangle: ["M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"],
  ellipse: ["M4 12a8 6 0 1 0 16 0a8 6 0 1 0-16 0"],
  diamond: ["M12 4l8 8-8 8-8-8z"],
  shapes: [
    "M5 12.5h5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19v-5A1.5 1.5 0 0 1 5 12.5z",
    "M11.5 8a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0",
  ],
  undo: ["M9 14 4 9l5-5M4 9h9.5a6 6 0 0 1 0 12H11"],
  redo: ["M15 14l5-5-5-5M20 9h-9.5a6 6 0 0 0 0 12H13"],
  cards: [
    "M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z",
    "M12 8.5v7M8.5 12h7",
  ],
  search: ["M4.5 11a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0", "M16 16l4 4"],
};
