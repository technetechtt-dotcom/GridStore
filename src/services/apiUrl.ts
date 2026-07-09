type QueryParams = Record<string, string | number | boolean | undefined>;

export function getApiBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
}

function getBaseOrigin() {
  if (typeof globalThis.location !== 'undefined' && globalThis.location.origin) {
    return globalThis.location.origin;
  }
  return 'http://localhost:5173';
}

/** Build a fetch URL that works locally (/api proxy) and on Render (absolute API host). */
export function buildApiUrl(path: string, query?: QueryParams) {
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const isAbsolute = /^https?:\/\//i.test(base);

  const url = isAbsolute
    ? new URL(`${base}${normalizedPath}`)
    : new URL(`${base}${normalizedPath}`, getBaseOrigin());

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }

  return isAbsolute ? url.toString() : `${url.pathname}${url.search}`;
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers?.get?.('content-type') ?? '';

  if (contentType.includes('text/html')) {
    throw new Error(
      'API returned HTML instead of JSON. Check VITE_API_BASE_URL points to the API host (e.g. https://gridstore-api.onrender.com/api).'
    );
  }

  if (contentType.includes('application/json') || !contentType) {
    return (await response.json()) as T;
  }

  const text = await response.text();
  if (text.trim().toLowerCase().startsWith('<!doctype') || text.trim().toLowerCase().startsWith('<html')) {
    throw new Error(
      'API returned HTML instead of JSON. Check VITE_API_BASE_URL points to the API host (e.g. https://gridstore-api.onrender.com/api).'
    );
  }

  throw new Error(`API returned non-JSON response (${contentType || 'unknown'})`);
}
