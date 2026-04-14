export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttribute(value) {
  return escapeHtml(value);
}

export function renderMultiline(value) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

export function truncateText(value, maxLength = 120) {
  const normalized = String(value || "")
    .replaceAll("\\r\\n", "\n")
    .replaceAll("\\n", "\n")
    .replaceAll("\\t", " ")
    .trim()
    .replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function optionList(items, selectedValue, { allowBlank = false, blankLabel = "None" } = {}) {
  const values = [...items];
  if (selectedValue && !values.includes(selectedValue)) {
    values.push(selectedValue);
  }
  const options = values.map((item) => (
    `<option value="${escapeAttribute(item)}" ${item === selectedValue ? "selected" : ""}>${escapeHtml(item)}</option>`
  ));
  if (allowBlank) {
    options.unshift(`<option value="" ${selectedValue ? "" : "selected"}>${escapeHtml(blankLabel)}</option>`);
  }
  return options.join("");
}

export function captureSurfaceState(rootNode, scrollTargetSelector = null) {
  const activeElement = document.activeElement;
  const scrollTarget = scrollTargetSelector ? rootNode.querySelector(scrollTargetSelector) : rootNode;
  const snapshot = {
    focusId: "",
    scrollSelector: scrollTargetSelector,
    scrollTop: scrollTarget?.scrollTop ?? 0,
    scrollLeft: scrollTarget?.scrollLeft ?? 0,
    selectionStart: null,
    selectionEnd: null,
    selectionDirection: null,
    fieldScrollTop: null,
    fieldScrollLeft: null
  };

  if (!(activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLSelectElement)) {
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
      snapshot.selectionDirection = activeElement.selectionDirection;
      snapshot.fieldScrollTop = activeElement.scrollTop;
      snapshot.fieldScrollLeft = activeElement.scrollLeft;
    } catch (_error) {
      // ignore unsupported selection APIs
    }
  }
  return snapshot;
}

export function restoreSurfaceState(rootNode, snapshot) {
  if (!snapshot) {
    return;
  }

  const scrollTarget = snapshot.scrollSelector ? rootNode.querySelector(snapshot.scrollSelector) : rootNode;
  if (scrollTarget) {
    scrollTarget.scrollTop = snapshot.scrollTop;
    scrollTarget.scrollLeft = snapshot.scrollLeft;
  }

  if (!snapshot.focusId) {
    return;
  }

  const field = document.getElementById(snapshot.focusId);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) {
    return;
  }
  if (!rootNode.contains(field)) {
    return;
  }

  field.focus({ preventScroll: true });
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    try {
      if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
        field.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd, snapshot.selectionDirection || "none");
      }
      if (snapshot.fieldScrollTop !== null) {
        field.scrollTop = snapshot.fieldScrollTop;
      }
      if (snapshot.fieldScrollLeft !== null) {
        field.scrollLeft = snapshot.fieldScrollLeft;
      }
    } catch (_error) {
      // ignore unsupported selection APIs
    }
  }
}

export function renderOwnerRefControl({
  id,
  ownerType,
  value,
  profiles,
  placeholder = "owner ref…",
  className = "input",
  allowBlank = false,
  attributes = ""
}) {
  if (ownerType === "ai_profile") {
    const profileIds = profiles.map((item) => item.id);
    const resolvedClassName = className && className !== "input" && className !== "select" ? `select ${className}` : "select";
    return `<select id="${id}" class="${resolvedClassName}" ${attributes}>${optionList(profileIds, value, { allowBlank, blankLabel: "Select profile" })}</select>`;
  }
  return `<input id="${id}" class="${className}" type="text" value="${escapeAttribute(value || "")}" placeholder="${escapeAttribute(placeholder)}" ${attributes} />`;
}
