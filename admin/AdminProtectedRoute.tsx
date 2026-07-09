import React from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '../src/components/ui/button';
import { Card, CardContent } from '../src/components/ui/card';
import { useOpsSession } from '../src/hooks/useOpsSession';
import { useApp } from '../src/context/AppContext';

export function AdminProtectedRoute() {
  const { user } = useApp();
  const location = useLocation();
  const { ready, authenticated, opsUser, requiresApiAuth } = useOpsSession();
  const effectiveUser = user ?? opsUser;

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Verifying ops session...
      </div>
    );
  }

  if (requiresApiAuth && !authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!effectiveUser) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading account...
      </div>
    );
  }

  if (effectiveUser.role !== 'admin' && effectiveUser.role !== 'moderator') {
    return (
      <div className="container mx-auto max-w-xl px-4 py-16">
        <Card>
          <CardContent className="space-y-4 p-8 text-center">
            <h1 className="text-2xl font-display font-bold">Admin access required</h1>
            <p className="text-muted-foreground">
              This ops dashboard is limited to admin and moderator accounts.
            </p>
            <Button asChild variant="outline">
              <Link to="/login">Sign in with admin account</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}
