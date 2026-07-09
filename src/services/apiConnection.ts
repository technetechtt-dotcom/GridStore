import { buildApiUrl, getApiBaseUrl, getPlatformUrls, parseJsonResponse } from './apiUrl';

export type ApiMode = 'checking' | 'live' | 'demo';
export type ConnectionStatus = 'checking' | 'connected' | 'disconnected';

export interface PlatformHealth {
  status: string;
  service: string;
  marketplaceUrl?: string;
  opsDashboardUrl?: string;
  timestamp: string;
}

const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? '10000');
const MONITOR_INTERVAL_MS = Number(import.meta.env.VITE_API_MONITOR_MS ?? '20000');

let apiMode: ApiMode = 'checking';
let connectionStatus: ConnectionStatus = 'checking';
let lastHealth: PlatformHealth | null = null;
let lastError: string | null = null;
let fallbackNoticeShown = false;

const apiModeListeners = new Set<(mode: ApiMode) => void>();
const connectionListeners = new Set<(status: ConnectionStatus) => void>();

function setApiMode(mode: ApiMode) {
  apiMode = mode;
  apiModeListeners.forEach((listener) => listener(mode));
}

function setConnectionStatus(status: ConnectionStatus) {
  connectionStatus = status;
  connectionListeners.forEach((listener) => listener(status));
}

function showFallbackNotice(error: unknown) {
  if (fallbackNoticeShown) return;
  fallbackNoticeShown = true;
  console.warn('[api] Falling back to local catalog data.', error);
}

export async function probeApiConnection() {
  return checkApiConnection();
}

export function getApiMode() {
  return apiMode;
}

export function getConnectionStatus() {
  return connectionStatus;
}

export function getLastHealth() {
  return lastHealth;
}

export function getLastConnectionError() {
  return lastError;
}

export function subscribeApiMode(listener: (mode: ApiMode) => void) {
  apiModeListeners.add(listener);
  listener(apiMode);
  return () => apiModeListeners.delete(listener);
}

export function subscribeConnectionStatus(listener: (status: ConnectionStatus) => void) {
  connectionListeners.add(listener);
  listener(connectionStatus);
  return () => connectionListeners.delete(listener);
}

export async function checkApiConnection(options: { silent?: boolean } = {}) {
  const { silent = false } = options;
  if (!silent) {
    setApiMode('checking');
    setConnectionStatus('checking');
  }
  lastError = null;

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(buildApiUrl('/health'), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const health = await parseJsonResponse<PlatformHealth>(response);
    if (health.status !== 'ok') {
      throw new Error('API health check failed');
    }

    lastHealth = health;
    setApiMode('live');
    setConnectionStatus('connected');
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'API unreachable';
    lastError = message;
    setApiMode('demo');
    setConnectionStatus('disconnected');
    showFallbackNotice(error);
    return false;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function notifyApiRequestSuccess() {
  setApiMode('live');
}

export function notifyApiRequestFailure(error: unknown) {
  setApiMode('demo');
  showFallbackNotice(error);
}

export function startConnectionMonitor(intervalMs = MONITOR_INTERVAL_MS) {
  void checkApiConnection();

  const timer = globalThis.setInterval(() => {
    void checkApiConnection({ silent: true });
  }, intervalMs);

  return () => globalThis.clearInterval(timer);
}

export function getConnectionSummary() {
  const urls = getPlatformUrls();
  return {
    apiUrl: getApiBaseUrl(),
    marketplaceUrl: lastHealth?.marketplaceUrl || urls.marketplace,
    opsDashboardUrl: lastHealth?.opsDashboardUrl || urls.opsDashboard,
    status: connectionStatus,
    mode: apiMode,
    error: lastError,
  };
}
