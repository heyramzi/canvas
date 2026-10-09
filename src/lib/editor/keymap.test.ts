import { describe, expect, it } from "vitest";
import { resolveEditorKeyAction, isEditingTarget, isPanActivationKey } from "#src/editor/keymap.js";

function press(
  key: string,
  opts: { meta?: boolean; shift?: boolean; editing?: boolean } = {},
): KeyboardEvent {
  const target = opts.editing ? { tagName: "INPUT" } : { tagName: "DIV" };
  return {
    key,
    metaKey: opts.meta ?? false,
    ctrlKey: false,
    shiftKey: opts.shift ?? false,
    target,
  } as unknown as KeyboardEvent;
}

describe("resolveEditorKeyAction", () => {
  it("maps the undo and redo chords", () => {
    expect(resolveEditorKeyAction(press("z", { meta: true }), false)).toBe("undo");
    expect(resolveEditorKeyAction(press("z", { meta: true, shift: true }), false)).toBe("redo");
    expect(resolveEditorKeyAction(press("y", { meta: true }), false)).toBe("redo");
  });

  it("maps the clipboard chords, and leaves them to a field being typed in", () => {
    expect(resolveEditorKeyAction(press("c", { meta: true }), false)).toBe("copy");
    expect(resolveEditorKeyAction(press("v", { meta: true }), false)).toBe("paste");
    expect(resolveEditorKeyAction(press("a", { meta: true }), false)).toBe("select-all");
    expect(resolveEditorKeyAction(press("c", { meta: true, editing: true }), false)).toBeNull();
    expect(resolveEditorKeyAction(press("a", { meta: true, editing: true }), false)).toBeNull();
  });

  it("saves whatever has focus", () => {
    expect(resolveEditorKeyAction(press("s", { meta: true }), false)).toBe("save");
    expect(resolveEditorKeyAction(press("s", { meta: true, editing: true }), false)).toBe("save");
  });

  it("deletes only with a selection, and never while typing", () => {
    expect(resolveEditorKeyAction(press("Delete"), true)).toBe("delete");
    expect(resolveEditorKeyAction(press("Backspace"), true)).toBe("delete");
    expect(resolveEditorKeyAction(press("Delete"), false)).toBeNull();
    expect(resolveEditorKeyAction(press("Backspace", { editing: true }), true)).toBeNull();
  });

  it("claims nothing else", () => {
    expect(resolveEditorKeyAction(press("Tab"), true)).toBeNull();
    expect(resolveEditorKeyAction(press("k"), true)).toBeNull();
    expect(resolveEditorKeyAction(press("b", { meta: true }), true)).toBeNull();
  });
});

describe("isEditingTarget", () => {
  it("names the elements that own their own keys", () => {
    expect(isEditingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isEditingTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(
      isEditingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget),
    ).toBe(true);
    expect(isEditingTarget({ tagName: "DIV" } as unknown as EventTarget)).toBe(false);
    expect(isEditingTarget(null)).toBe(false);
  });
});

describe("isPanActivationKey", () => {
  function space(
    target: Record<string, unknown> = { tagName: "DIV" },
    mods: { meta?: boolean; ctrl?: boolean; alt?: boolean } = {},
  ): KeyboardEvent {
    return {
      code: "Space",
      key: " ",
      metaKey: mods.meta ?? false,
      ctrlKey: mods.ctrl ?? false,
      altKey: mods.alt ?? false,
      target: { getAttribute: () => null, ...target },
    } as unknown as KeyboardEvent;
  }

  it("is the hand tool over the canvas", () => {
    expect(isPanActivationKey(space())).toBe(true);
  });

  it("leaves space to a field being typed in", () => {
    expect(isPanActivationKey(space({ tagName: "TEXTAREA" }))).toBe(false);
    expect(isPanActivationKey(space({ tagName: "DIV", isContentEditable: true }))).toBe(false);
  });

  it("leaves space to a control that activates on it", () => {
    expect(isPanActivationKey(space({ tagName: "BUTTON" }))).toBe(false);
    expect(isPanActivationKey(space({ tagName: "DIV", getAttribute: () => "button" }))).toBe(false);
  });

  it("claims no other key, and no chord", () => {
    expect(isPanActivationKey({ code: "KeyS", key: "s" } as KeyboardEvent)).toBe(false);
    expect(isPanActivationKey(space({ tagName: "DIV" }, { meta: true }))).toBe(false);
  });
});
