import { describe, expect, it } from "vitest";
import { shortcutTip } from "#src/ui/shortcut-tip.js";

describe("shortcutTip", () => {
  it("joins Mac glyphs with no separator", () => {
    expect(shortcutTip("Redo", ["mod", "shift", "Z"], true)).toBe("Redo  ⌘⇧Z");
  });

  it("spells the modifiers out elsewhere", () => {
    expect(shortcutTip("Undo", ["mod", "Z"], false)).toBe("Undo  Ctrl+Z");
  });

  it("returns the bare label with no key", () => {
    expect(shortcutTip("Fit", [])).toBe("Fit");
  });
});
