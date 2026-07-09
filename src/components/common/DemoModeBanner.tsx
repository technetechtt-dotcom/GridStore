import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getApiBaseUrl } from '../../services/apiUrl';
import { getApiMode, probeApiConnection, subscribeApiMode } from '../../services/mockApi';

function getHelpMessage() {
  const apiUrl = getApiBaseUrl();
  const onRender = typeof window !== 'undefined' && window.location.hostname.endsWith('.onrender.com');

  if (onRender) {
    return (
      <>
        The live API could not be reached at <code className="rounded bg-background/80 px-1">{apiUrl}</code>.
        Redeploy <code className="rounded bg-background/80 px-1">gridstore-web</code> and{' '}
        <code className="rounded bg-background/80 px-1">gridstore-api</code> on Render, and confirm the API
        health check returns JSON.
      </>
    );
  }

  if (apiUrl.startsWith('/')) {
    return (
      <>
        Start the full stack with <code className="rounded bg-background/80 px-1">npm run dev:all</code>, or set{' '}
        <code className="rounded bg-background/80 px-1">VITE_API_BASE_URL=http://localhost:4000/api</code> in{' '}
        <code className="rounded bg-background/80 px-1">.env</code> and run the API on port 4000.
      </>
    );
  }

  return (
    <>
      Start the API with <code className="rounded bg-background/80 px-1">npm run dev:server</code> or{' '}
      <code className="rounded bg-background/80 px-1">npm run dev:all</code>. Current target:{' '}
      <code className="rounded bg-background/80 px-1">{apiUrl}</code>
    </>
  );
}

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
          <strong>Demo mode:</strong> backend API is unavailable, so GridStore is using local catalogue data.{' '}
          {getHelpMessage()}
        </p>
      </div>
    </div>
  );
}
