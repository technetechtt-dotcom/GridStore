import { useEffect, useState } from 'react';
import type { AppUser } from '../types';
import { getApiMode, subscribeApiMode } from '../services/apiConnection';
import { apiGetMe, getAuthToken } from '../services/platformApi';

function waitForApiMode() {
  const mode = getApiMode();
  if (mode !== 'checking') {
    return Promise.resolve(mode);
  }

  return new Promise<'live' | 'demo'>((resolve) => {
    const unsubscribe = subscribeApiMode((nextMode) => {
      if (nextMode === 'checking') return;
      unsubscribe();
      resolve(nextMode);
    });
  });
}

export function useOpsSession() {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [opsUser, setOpsUser] = useState<AppUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const mode = await waitForApiMode();
      if (cancelled) return;

      if (mode === 'demo') {
        setAuthenticated(true);
        setReady(true);
        return;
      }

      const token = getAuthToken();
      if (!token) {
        setAuthenticated(false);
        setOpsUser(null);
        setReady(true);
        return;
      }

      try {
        const me = await apiGetMe();
        setOpsUser(me);
        setAuthenticated(me.role === 'admin' || me.role === 'moderator');
      } catch {
        setOpsUser(null);
        setAuthenticated(false);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ready,
    authenticated,
    opsUser,
    requiresApiAuth: getApiMode() !== 'demo',
  };
}
