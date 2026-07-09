export function adminPath(segment = '') {
  const base = (import.meta.env.VITE_ADMIN_BASE_PATH ?? '/admin').replace(/\/$/, '');
  if (!segment) return base || '/';
  return `${base}/${segment}`;
}
