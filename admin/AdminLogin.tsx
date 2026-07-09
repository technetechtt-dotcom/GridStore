import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Lock, Mail, Shield } from 'lucide-react';
import { Button } from '../src/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../src/components/ui/card';
import { Input } from '../src/components/ui/input';
import { useApp } from '../src/context/AppContext';
import { getConnectionStatus } from '../src/services/apiConnection';

export function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const { login } = useApp();
  const [email, setEmail] = React.useState('admin@gridstore.local');
  const [password, setPassword] = React.useState('demo1234');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      const user = await login(email, password, 'admin');
      if (user.role !== 'admin' && user.role !== 'moderator') {
        toast.error('This account does not have ops dashboard access');
        return;
      }
      toast.success('Signed in to ops dashboard');
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in';
      if (getConnectionStatus() === 'disconnected') {
        toast.error('API is unreachable. Start the backend (npm run dev:server) and retry.');
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Shield className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-display">GridStore Ops</CardTitle>
          <CardDescription>Sign in with an admin or moderator account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2 text-sm">
              <span>Email</span>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-10"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@gridstore.local"
                  required
                />
              </div>
            </label>
            <label className="block space-y-2 text-sm">
              <span>Password</span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-10"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                  required
                />
              </div>
            </label>
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in to dashboard'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Demo: <span className="font-medium">admin@gridstore.local</span> /{' '}
            <span className="font-medium">demo1234</span>
          </p>
          <p className="mt-3 text-center text-sm">
            <Link to="/" className="text-primary hover:underline">
              Back to dashboard home
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
