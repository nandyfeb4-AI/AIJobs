function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function stripHtml(html?: string | null) {
  if (!html) return null;

  let output = html;

  // Some sources double-escape HTML, so decode a couple of passes before stripping tags.
  for (let index = 0; index < 2; index += 1) {
    const decoded = decodeHtmlEntities(output);
    if (decoded === output) break;
    output = decoded;
  }

  return output
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toIsoDate(value?: string | number | null) {
  if (!value) return null;

  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function buildSalaryLabel(parts: Array<string | null | undefined>) {
  const cleaned = parts.map((part) => part?.trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(" · ") : null;
}
