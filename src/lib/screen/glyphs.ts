// The card's small drawings, as files a CSS mask paints in the current colour.

import header from "#src/screen/glyphs/header.svg";
import button from "#src/screen/glyphs/button.svg";
import input from "#src/screen/glyphs/input.svg";
import image from "#src/screen/glyphs/image.svg";
import list from "#src/screen/glyphs/list.svg";
import modal from "#src/screen/glyphs/modal.svg";
import up from "#src/screen/glyphs/up.svg";
import down from "#src/screen/glyphs/down.svg";
import close from "#src/screen/glyphs/close.svg";
import plus from "#src/screen/glyphs/plus.svg";
import hills from "#src/screen/glyphs/hills.svg";

export type GlyphName =
  | "header"
  | "button"
  | "input"
  | "image"
  | "list"
  | "modal"
  | "up"
  | "down"
  | "close"
  | "plus"
  | "hills";

export const GLYPHS: Record<GlyphName, string> = {
  header,
  button,
  input,
  image,
  list,
  modal,
  up,
  down,
  close,
  plus,
  hills,
};
