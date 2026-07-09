export function matchesQuery(fields: Array<string | undefined | null>, query: string): boolean {
  const trimmed = query?.trim() ?? '';
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return fields.some((field) => (field ?? '').toLowerCase().includes(lower));
}
