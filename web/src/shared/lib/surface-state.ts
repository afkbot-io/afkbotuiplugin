export type SurfaceSnapshot = {
  fieldScrollLeft: number | null;
  fieldScrollTop: number | null;
  focusId: string;
  scrollLeft: number;
  scrollSelector: string | null;
  scrollTop: number;
  selectionDirection: SelectionDirection | null;
  selectionEnd: number | null;
  selectionStart: number | null;
};

export function captureSurfaceState(rootNode: ParentNode, scrollTargetSelector?: string | null): SurfaceSnapshot {
  const activeElement = document.activeElement;
  const scrollTarget = scrollTargetSelector ? rootNode.querySelector(scrollTargetSelector) : rootNode;
  const snapshot: SurfaceSnapshot = {
    fieldScrollLeft: null,
    fieldScrollTop: null,
    focusId: "",
    scrollLeft: scrollTarget instanceof HTMLElement ? scrollTarget.scrollLeft : 0,
    scrollSelector: scrollTargetSelector || null,
    scrollTop: scrollTarget instanceof HTMLElement ? scrollTarget.scrollTop : 0,
    selectionDirection: null,
    selectionEnd: null,
    selectionStart: null,
  };

  if (
    !(activeElement instanceof HTMLInputElement) &&
    !(activeElement instanceof HTMLTextAreaElement) &&
    !(activeElement instanceof HTMLSelectElement)
  ) {
    return snapshot;
  }

  if (!activeElement.id || !rootNode.contains(activeElement)) {
    return snapshot;
  }

  snapshot.focusId = activeElement.id;
  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
    try {
      snapshot.selectionStart = activeElement.selectionStart;
      snapshot.selectionEnd = activeElement.selectionEnd;
      snapshot.selectionDirection = activeElement.selectionDirection as SelectionDirection | null;
      snapshot.fieldScrollTop = activeElement.scrollTop;
      snapshot.fieldScrollLeft = activeElement.scrollLeft;
    } catch {
      // Selection APIs are not always available.
    }
  }
  return snapshot;
}

export function restoreSurfaceState(rootNode: ParentNode, snapshot: SurfaceSnapshot | null | undefined) {
  if (!snapshot) {
    return;
  }

  const scrollTarget = snapshot.scrollSelector ? rootNode.querySelector(snapshot.scrollSelector) : rootNode;
  if (scrollTarget instanceof HTMLElement) {
    scrollTarget.scrollTop = snapshot.scrollTop;
    scrollTarget.scrollLeft = snapshot.scrollLeft;
  }

  if (!snapshot.focusId) {
    return;
  }

  const field = document.getElementById(snapshot.focusId);
  if (
    !(field instanceof HTMLInputElement) &&
    !(field instanceof HTMLTextAreaElement) &&
    !(field instanceof HTMLSelectElement)
  ) {
    return;
  }
  if (!rootNode.contains(field)) {
    return;
  }

  field.focus({ preventScroll: true });
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    try {
      if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
        field.setSelectionRange(
          snapshot.selectionStart,
          snapshot.selectionEnd,
          (snapshot.selectionDirection || "none") as SelectionDirection,
        );
      }
      if (snapshot.fieldScrollTop !== null) {
        field.scrollTop = snapshot.fieldScrollTop;
      }
      if (snapshot.fieldScrollLeft !== null) {
        field.scrollLeft = snapshot.fieldScrollLeft;
      }
    } catch {
      // Selection APIs are not always available.
    }
  }
}
