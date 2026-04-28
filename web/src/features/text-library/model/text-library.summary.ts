const MIN_RICH_SUMMARY_LENGTH = 48;

export function summarizeTextLibraryItem({
  content,
  fallback = "",
  maxLength = 240,
  summary,
}: {
  content: unknown;
  fallback?: unknown;
  maxLength?: number;
  summary: unknown;
}) {
  const rawSummary = normalizeSummaryText(summary);
  const contentSummary = normalizeSummaryText(stripMarkdownStructure(content));
  const fallbackText = normalizeSummaryText(fallback);
  const shouldPreferContent =
    contentSummary.length >= MIN_RICH_SUMMARY_LENGTH &&
    contentSummary.length > rawSummary.length + 24;
  return truncateSummary(
    shouldPreferContent ? contentSummary : rawSummary || contentSummary || fallbackText,
    maxLength,
  );
}

function stripMarkdownStructure(value: unknown) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/u, "")
        .replace(/^\s*[-*+]\s+/u, "")
        .replace(/^\s*\d+[.)]\s+/u, "")
        .replace(/^\s*>\s?/u, "")
        .trim(),
    )
    .filter(Boolean)
    .join(" ");
}

function normalizeSummaryText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateSummary(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
