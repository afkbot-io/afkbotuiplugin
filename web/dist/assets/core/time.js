const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function formatDateTime(value) {
  if (!value) {
    return "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return dateTimeFormatter.format(date);
}

export function formatRelative(value) {
  if (!value) {
    return "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);
  const absMinutes = Math.abs(diffMinutes);

  if (absMinutes < 1) {
    return "just now";
  }
  if (absMinutes < 60) {
    return diffMinutes > 0 ? `in ${absMinutes}m` : `${absMinutes}m ago`;
  }

  const diffHours = Math.round(absMinutes / 60);
  if (diffHours < 24) {
    return diffMinutes > 0 ? `in ${diffHours}h` : `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return diffMinutes > 0 ? `in ${diffDays}d` : `${diffDays}d ago`;
}

export function exactAndRelative(value) {
  return {
    exact: formatDateTime(value),
    relative: formatRelative(value),
  };
}
