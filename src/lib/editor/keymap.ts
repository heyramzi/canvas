// The canvas keyboard map, as a resolver rather than a switch in the editor.
// Mirrors resolveMindmapKeyAction in mindmap-keyboard.ts, which the mode
// controllers already read.

export type EditorKeyAction =
  | "undo"
  | "redo"
  | "copy"
  | "paste"
  | "select-all"
  | "save"
  | "delete"
  | "duplicate"
  | "group"
  | "ungroup"
  | "zoom-in"
  | "zoom-out"
  | "zoom-100"
  | "zoom-fit"
  | "zoom-selection"
  | "bring-forward"
  | "send-backward"
  | "bring-to-front"
  | "send-to-back"
  | "lock"
  | "copy-as-png"
  | "present";

/** True while the event's target owns its own text editing. */
export function isEditingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable === true;
}

/** The action a key means on the canvas, or null when the canvas does not own it. */
export function resolveEditorKeyAction(
  event: KeyboardEvent,
  hasSelection: boolean,
): EditorKeyAction | null {
  const key = event.key.toLowerCase();
  const mod = event.metaKey || event.ctrlKey;
  const editing = isEditingTarget(event.target);
  if (mod) return modAction(key, event.shiftKey, editing);
  if (event.key === "Delete" || event.key === "Backspace") {
    return hasSelection && !editing ? "delete" : null;
  }
  return editing || event.altKey ? null : plainAction(event);
}

/** Zoom keys with no chord: + and -, and Shift with 0, 1 or 2 (read by code, so a layout that moves the digits still works). */
function plainAction(event: KeyboardEvent): EditorKeyAction | null {
  if (event.shiftKey) {
    if (event.code === "Digit0") return "zoom-100";
    if (event.code === "Digit1") return "zoom-fit";
    if (event.code === "Digit2") return "zoom-selection";
  }
  if (event.key === "]") return "bring-forward";
  if (event.key === "[") return "send-backward";
  if (event.key === "+" || event.key === "=") return "zoom-in";
  return event.key === "-" || event.key === "_" ? "zoom-out" : null;
}

/** The move an arrow key asks for: 1px, or 10px with Shift. Null for anything else, or while a field owns the keys. */
export function resolveNudge(event: KeyboardEvent): { dx: number; dy: number } | null {
  if (event.metaKey || event.ctrlKey || event.altKey || isEditingTarget(event.target)) return null;
  const step = event.shiftKey ? 10 : 1;
  switch (event.key) {
    case "ArrowLeft":
      return { dx: -step, dy: 0 };
    case "ArrowRight":
      return { dx: step, dy: 0 };
    case "ArrowUp":
      return { dx: 0, dy: -step };
    case "ArrowDown":
      return { dx: 0, dy: step };
    default:
      return null;
  }
}

/** The chord half of the map. `editing` is true while a field owns the keys. */
function modAction(key: string, shift: boolean, editing: boolean): EditorKeyAction | null {
  if (key === "z") return shift ? "redo" : "undo";
  if (key === "y") return "redo";
  // Save works whatever has focus, and whatever the autosave preference is.
  if (key === "s" && !shift) return "save";
  // Cut, copy, paste and select-all belong to the focused field while one is
  // being typed in; the canvas only claims them otherwise.
  if (editing) return null;
  if (key === "c") return shift ? "copy-as-png" : "copy";
  if (key === "v") return "paste";
  if (key === "a") return "select-all";
  if (key === "d" && !shift) return "duplicate";
  if (key === "g") return shift ? "ungroup" : "group";
  if (key === "l" && shift) return "lock";
  if (key === "]") return "bring-to-front";
  if (key === "[") return "send-to-back";
  if (key === "enter") return "present";
  if (key === "=" || key === "+") return "zoom-in";
  return key === "-" || key === "_" ? "zoom-out" : null;
}

/** Tags and roles that activate on Space themselves, so the canvas must not steal it. */
const SPACE_OWNING_TAGS = new Set(["BUTTON", "A", "SUMMARY", "SELECT", "OPTION"]);
const SPACE_OWNING_ROLES = new Set([
  "button",
  "checkbox",
  "switch",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "tab",
]);

/** Space means hand tool over the canvas, never in a field or on a Space-activating control. Reads code, so remapped layouts still pan. */
export function isPanActivationKey(event: KeyboardEvent): boolean {
  if (event.code !== "Space" && event.key !== " ") return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (isEditingTarget(event.target)) return false;
  return !ownsSpace(event.target as HTMLElement | null);
}

/** A control that already does something on Space: a button, a checkbox, a tab. */
function ownsSpace(el: HTMLElement | null): boolean {
  if (el?.tagName && SPACE_OWNING_TAGS.has(el.tagName)) return true;
  const role = el?.getAttribute?.("role");
  return Boolean(role && SPACE_OWNING_ROLES.has(role));
}
