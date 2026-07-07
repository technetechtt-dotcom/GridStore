import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { useApp } from '../../context/AppContext';
import type { UserRole } from '../../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: UserRole[];
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user } = useApp();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-xl">
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <h1 className="text-2xl font-display font-bold">Role access required</h1>
            <p className="text-muted-foreground">
              This area is available to {roles.join(', ')} accounts. Sign in with the right role
              or create a seller account.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Button asChild>
                <Link to="/signup">Create account</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/dashboard">Back to dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
