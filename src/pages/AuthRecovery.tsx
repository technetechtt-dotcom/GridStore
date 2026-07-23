import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { apiConfirmPasswordReset, apiRequestPasswordReset, apiVerifyEmail } from '../services/platformApi';

export function PasswordResetPage() {
  const [params] = useSearchParams();
  const tokenFromQuery = params.get('token') ?? '';
  const [email, setEmail] = useState('');
  const [token, setToken] = useState(tokenFromQuery);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);

  const requestReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await apiRequestPasswordReset(email);
      setRequested(true);
      toast.success('If that account exists, a reset message was queued.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to request reset');
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await apiConfirmPasswordReset(token, password);
      toast.success('Password updated. You are signed in.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto flex min-h-[70vh] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Password recovery</CardTitle>
          <CardDescription>
            Request a reset token, then confirm with a strong new password. Tokens are single-use and expire in 30 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <form className="space-y-3" onSubmit={requestReset}>
            <h2 className="font-semibold">1. Request reset</h2>
            <Input
              type="email"
              placeholder="Account email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Button type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send reset instructions'}
            </Button>
            {requested ? (
              <p className="text-sm text-muted-foreground">
                Check your email provider integration / server outbox for the reset token.
              </p>
            ) : null}
          </form>

          <form className="space-y-3" onSubmit={confirmReset}>
            <h2 className="font-semibold">2. Confirm new password</h2>
            <Input
              placeholder="Reset token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="New password (min 10, mixed case + number)"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Update password'}
            </Button>
          </form>

          <p className="text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline">
              Back to login
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function EmailVerifyPage() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get('token') ?? '');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await apiVerifyEmail(token);
      setVerified(true);
      toast.success('Email verified');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to verify email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto flex min-h-[70vh] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="font-display text-2xl">Verify email</CardTitle>
          <CardDescription>Confirm the verification token sent after signup.</CardDescription>
        </CardHeader>
        <CardContent>
          {verified ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Your email is verified.</p>
              <Button asChild>
                <Link to="/login">Continue to login</Link>
              </Button>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={verify}>
              <Input
                placeholder="Verification token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                required
              />
              <Button type="submit" disabled={loading}>
                {loading ? 'Verifying...' : 'Verify email'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
