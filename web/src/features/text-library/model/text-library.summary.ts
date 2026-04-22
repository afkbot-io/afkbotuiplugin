function normalizeSummaryLine(line: string) {
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^`{1,3}|`{1,3}$/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/(^|[^\p{L}\p{N}])_(?!\s)([^_]+?)(?<!\s)_(?=($|[^\p{L}\p{N}]))/gu, "$1$2")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .trim();
}

function cleanupSummaryText(value: string) {
  return value
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => normalizeSummaryLine(line))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMarkdownExcerpt(content: string, title: string) {
  const normalizedTitle = cleanupSummaryText(title).toLowerCase();
  const lines = content
    .replaceAll("\r\n", "\n")
    .replace(/^---[\s\S]*?\n---\n?/u, "")
    .split("\n")
    .map((line) => normalizeSummaryLine(line))
    .filter((line) => Boolean(line) && !line.startsWith("```"));

  const collected: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    const normalizedLine = line.toLowerCase();
    if (normalizedTitle && normalizedLine === normalizedTitle) {
      continue;
    }
    if (line.endsWith(":") && lines[index + 1]) {
      const combined = `${line} ${lines[index + 1]}`.trim();
      collected.push(combined);
      index += 1;
      continue;
    }
    collected.push(line);
    if (collected.length >= 3) {
      break;
    }
  }

  return cleanupSummaryText(collected.join(" ")).slice(0, 320).trim();
}

export function buildTextLibrarySummary(rawSummary: unknown, content: unknown, title: unknown) {
  const rawSummaryText = String(rawSummary || "").trim();
  const fallbackSummary = cleanupSummaryText(rawSummaryText);
  const contentSummary = extractMarkdownExcerpt(String(content || ""), String(title || ""));

  if (!fallbackSummary) {
    return contentSummary;
  }

  const normalizedTitle = cleanupSummaryText(String(title || "")).toLowerCase();
  const looksLikeHeadingOnly =
    rawSummaryText.startsWith("#") ||
    (Boolean(normalizedTitle) && fallbackSummary.toLowerCase() === normalizedTitle) ||
    fallbackSummary.endsWith(":");

  if (looksLikeHeadingOnly && contentSummary) {
    return contentSummary;
  }

  return fallbackSummary;
}
