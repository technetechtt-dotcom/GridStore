export function matchesQuery(fields: string[], query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return fields.some((field) => field.toLowerCase().includes(lower));
}
