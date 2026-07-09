import React, { useEffect } from 'react';
import { startConnectionMonitor } from '../services/apiConnection';

export function PlatformConnectionProvider({
  children,
  monitorIntervalMs,
}: {
  children: React.ReactNode;
  monitorIntervalMs?: number;
}) {
  useEffect(() => startConnectionMonitor(monitorIntervalMs), [monitorIntervalMs]);
  return <>{children}</>;
}
