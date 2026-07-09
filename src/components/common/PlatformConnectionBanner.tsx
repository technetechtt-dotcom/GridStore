import React, { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, Unplug } from 'lucide-react';
import { Button } from '../ui/button';
import {
  checkApiConnection,
  getConnectionSummary,
  getLastConnectionError,
  subscribeConnectionStatus,
  type ConnectionStatus,
} from '../../services/apiConnection';

function StatusLinks() {
  const summary = getConnectionSummary();

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <a href={summary.apiUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
        API
      </a>
      <a
        href={summary.marketplaceUrl}
        target="_blank"
        rel="noreferrer"
        className="underline-offset-2 hover:underline"
      >
        Marketplace
      </a>
      <a
        href={summary.opsDashboardUrl}
        target="_blank"
        rel="noreferrer"
        className="underline-offset-2 hover:underline"
      >
        Ops dashboard
      </a>
    </span>
  );
}

export function PlatformConnectionBanner() {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeConnectionStatus(setStatus), []);

  useEffect(() => {
    if (status === 'disconnected') {
      setError(getLastConnectionError());
    } else {
      setError(null);
    }
  }, [status]);

  const retry = async () => {
    setRetrying(true);
    await checkApiConnection();
    setRetrying(false);
  };

  if (status === 'connected') {
    return (
      <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-foreground">
        <div className="container mx-auto flex flex-wrap items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <p>
            <strong>Platform connected.</strong> Marketplace, ops dashboard, and API are linked.{' '}
            <StatusLinks />
          </p>
        </div>
      </div>
    );
  }

  if (status === 'checking') {
    return (
      <div className="border-b border-border bg-muted/60 px-4 py-2 text-sm text-muted-foreground">
        <div className="container mx-auto flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <p>Connecting marketplace and ops dashboard to the API...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-foreground">
      <div className="container mx-auto flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <Unplug className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            <strong>Platform disconnected.</strong> Demo catalogue data is active until the API is
            reachable at <code className="rounded bg-background/80 px-1">{getConnectionSummary().apiUrl}</code>.
            {error ? <span className="block text-muted-foreground">{error}</span> : null}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void retry()} disabled={retrying}>
          {retrying ? 'Retrying...' : 'Retry connection'}
        </Button>
      </div>
    </div>
  );
}
