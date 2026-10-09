// The canvas keyboard map, as a resolver rather than a switch in the editor.
// Mirrors resolveMindmapKeyAction in mindmap-keyboard.ts, which the mode
// controllers already read.

export type EditorKeyAction = "undo" | "redo" | "copy" | "paste" | "select-all" | "save" | "delete";

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
  if (mod) return modAction(key, event.shiftKey, isEditingTarget(event.target));
  if (event.key !== "Delete" && event.key !== "Backspace") return null;
  return hasSelection && !isEditingTarget(event.target) ? "delete" : null;
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
  if (key === "c") return "copy";
  if (key === "v") return "paste";
  return key === "a" ? "select-all" : null;
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
