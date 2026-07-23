export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function nowLabel() {
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());
}

export function buildDisplayNameFromEmail(email: string) {
  const base = email.split('@')[0] ?? 'User';
  return base
    .split('.')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

export function inferRoleFromEmail(_email: string, fallback: import('../types.js').UserRole) {
  // Roles are loaded exclusively from the database. Never infer privileged roles from email.
  return fallback === 'seller' ? 'seller' : 'buyer';
}
