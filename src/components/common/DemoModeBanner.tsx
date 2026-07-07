import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getApiMode, probeApiConnection, subscribeApiMode } from '../../services/mockApi';

export function DemoModeBanner() {
  const [mode, setMode] = useState(getApiMode());

  useEffect(() => {
    void probeApiConnection();
    return subscribeApiMode(setMode);
  }, []);

  if (mode !== 'demo') {
    return null;
  }

  return (
    <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-foreground">
      <div className="container mx-auto flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        <p>
          Demo mode: backend API is unavailable, so GridStore is using local catalogue data.
          Configure <code className="rounded bg-background/80 px-1">VITE_API_BASE_URL</code> in{' '}
          <code className="rounded bg-background/80 px-1">.env</code> to connect a live API.
        </p>
      </div>
    </div>
  );
}
