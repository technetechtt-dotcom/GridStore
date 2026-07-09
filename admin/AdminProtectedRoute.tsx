import React from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button } from '../src/components/ui/button';
import { Card, CardContent } from '../src/components/ui/card';
import { useApp } from '../src/context/AppContext';

export function AdminProtectedRoute() {
  const { user } = useApp();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user.role !== 'admin' && user.role !== 'moderator') {
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
