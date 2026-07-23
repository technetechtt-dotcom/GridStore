/** Shared demo seed helpers — only used when ENABLE_DEMO_DATA is on. */
export const DEMO_SEED_PASSWORD = process.env.DEMO_SEED_PASSWORD ?? 'DemoSeed-ChangeMe1';

export function demoListingBadge(title: string) {
  return `DEMO · ${title}`;
}
