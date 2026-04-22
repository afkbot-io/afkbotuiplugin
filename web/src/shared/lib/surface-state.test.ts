import { describe, expect, it } from "vitest";

import { captureSurfaceState, restoreSurfaceState } from "@/shared/lib/surface-state";

describe("surface-state", () => {
  it("captures and restores scroll, focus, and selection state", () => {
    document.body.innerHTML = `
      <div id="root">
        <div id="scroll-target"></div>
        <textarea id="editor">abcdef</textarea>
      </div>
    `;

    const root = document.getElementById("root")!;
    const scrollTarget = document.getElementById("scroll-target") as HTMLDivElement;
    const editor = document.getElementById("editor") as HTMLTextAreaElement;

    scrollTarget.scrollTop = 42;
    scrollTarget.scrollLeft = 7;
    editor.focus();
    editor.setSelectionRange(1, 4, "backward");
    editor.scrollTop = 9;
    editor.scrollLeft = 3;

    const snapshot = captureSurfaceState(root, "#scroll-target");

    document.body.innerHTML = `
      <div id="root">
        <div id="scroll-target"></div>
        <textarea id="editor">abcdef</textarea>
      </div>
    `;

    const nextRoot = document.getElementById("root")!;
    const nextScrollTarget = document.getElementById("scroll-target") as HTMLDivElement;
    const nextEditor = document.getElementById("editor") as HTMLTextAreaElement;

    restoreSurfaceState(nextRoot, snapshot);

    expect(nextScrollTarget.scrollTop).toBe(42);
    expect(nextScrollTarget.scrollLeft).toBe(7);
    expect(document.activeElement).toBe(nextEditor);
    expect(nextEditor.selectionStart).toBe(1);
    expect(nextEditor.selectionEnd).toBe(4);
    expect(nextEditor.selectionDirection).toBe("backward");
    expect(nextEditor.scrollTop).toBe(9);
    expect(nextEditor.scrollLeft).toBe(3);
  });

  it("safely no-ops when the previously focused field no longer exists", () => {
    document.body.innerHTML = `
      <div id="root">
        <div id="scroll-target"></div>
        <input id="field" value="alpha" />
      </div>
    `;

    const root = document.getElementById("root")!;
    const field = document.getElementById("field") as HTMLInputElement;
    const scrollTarget = document.getElementById("scroll-target") as HTMLDivElement;

    scrollTarget.scrollTop = 18;
    field.focus();
    field.setSelectionRange(0, 2);

    const snapshot = captureSurfaceState(root, "#scroll-target");

    document.body.innerHTML = `
      <div id="root">
        <div id="scroll-target"></div>
      </div>
    `;

    const nextRoot = document.getElementById("root")!;
    const nextScrollTarget = document.getElementById("scroll-target") as HTMLDivElement;

    expect(() => restoreSurfaceState(nextRoot, snapshot)).not.toThrow();
    expect(nextScrollTarget.scrollTop).toBe(18);
  });
});
