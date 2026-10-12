// Single source of truth for product text-field parsing.
// Admin textarea <-> DB JSON/text <-> storefront display must all agree,
// otherwise saved specs/reviews render differently than typed.

export type SpecRow = { label: string; value: string };
export type ReviewRow = { text: string; name: string; avatar?: string };

export function parseSpecLines(value: string): SpecRow[] {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const separator = line.indexOf(':');
      return separator > 0
        ? { label: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() }
        : { label: 'Detail', value: line };
    })
    .filter(item => item.label || item.value);
}

export function formatSpecLines(rows?: SpecRow[]): string {
  return (rows ?? []).map(item => `${item.label}: ${item.value}`).join('\n');
}

export function parseReviewLines(value: string): ReviewRow[] {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const separator = line.indexOf(':');
      return separator > 0
        ? { name: line.slice(0, separator).trim() || 'Verified buyer', text: line.slice(separator + 1).trim() }
        : { name: 'Verified buyer', text: line };
    })
    .filter(item => item.text);
}

export function formatReviewLines(rows?: ReviewRow[]): string {
  return (rows ?? []).map(item => `${item.name}: ${item.text}`).join('\n');
}

export function parseDbSpecs(value: unknown): SpecRow[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return (value as unknown[])
      .map(item => {
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          const label = String(record.label ?? record.key ?? record.name ?? '').trim();
          const detail = String(record.value ?? record.detail ?? record.description ?? '').trim();
          return label || detail ? { label: label || 'Detail', value: detail } : null;
        }
        const text = String(item ?? '').trim();
        if (!text) return null;
        const separator = text.indexOf(':');
        return separator > 0
          ? { label: text.slice(0, separator).trim(), value: text.slice(separator + 1).trim() }
          : { label: 'Detail', value: text };
      })
      .filter((item): item is SpecRow => item !== null);
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([label, detail]) => ({ label: label.trim(), value: String(detail ?? '').trim() }))
      .filter(item => item.label || item.value);
  }
  const raw = String(value).trim();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parseDbSpecs(parsed);
  } catch {
    /* fall through to line split */
  }
  return parseSpecLines(raw);
}

export function parseDbReviews(value: unknown): ReviewRow[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .map(item => {
      if (!item || typeof item !== 'object') {
        const text = String(item ?? '').trim();
        return text ? { text, name: 'Verified buyer' } : null;
      }
      const record = item as Record<string, unknown>;
      const text = String(record.text ?? record.review ?? record.comment ?? '').trim();
      if (!text) return null;
      const name = String(record.name ?? record.author ?? 'Verified buyer').trim() || 'Verified buyer';
      const avatar = String(record.avatar ?? '').trim() || undefined;
      return { text, name, avatar };
    })
    .filter((item): item is ReviewRow => item !== null);
}
