import React, { useEffect } from 'react';
import { startConnectionMonitor } from '../services/apiConnection';

export function PlatformConnectionProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => startConnectionMonitor(), []);
  return <>{children}</>;
}
