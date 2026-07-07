import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Sparkles, Mail, Lock, User, ArrowRight, Github } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle } from
'../components/ui/card';
import { useApp } from '../context/AppContext';
import type { AppUser, UserRole } from '../types';

function redirectAfterAuth(
  navigate: ReturnType<typeof useNavigate>,
  user: AppUser,
  from?: string
) {
  if (from && from !== '/login' && from !== '/signup') {
    navigate(from, { replace: true });
    return;
  }
  navigate(user.role === 'seller' ? '/seller' : '/dashboard', { replace: true });
}

const REMEMBER_EMAIL_KEY = 'gridstore-remembered-email';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const { login, oauthLogin, requestPasswordReset } = useApp();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [role, setRole] = React.useState<UserRole>('buyer');
  const [rememberMe, setRememberMe] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const rememberedEmail = window.localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const user = await login(email, password, role);
      if (rememberMe) {
        window.localStorage.setItem(REMEMBER_EMAIL_KEY, email);
      } else {
        window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
      }
      toast.success(`Welcome back, ${user.name}`);
      redirectAfterAuth(navigate, user, from);
    } catch {
      toast.error('Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'github') => {
    const user = await oauthLogin(provider, role);
    toast.success(`${provider === 'google' ? 'Google' : 'GitHub'} session created`);
    redirectAfterAuth(navigate, user, from);
  };

  const handlePasswordReset = async () => {
    try {
      await requestPasswordReset(email);
      toast.success('Password reset handoff created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enter your email first');
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{
          opacity: 0,
          y: 20
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        transition={{
          duration: 0.5,
          ease: [0.16, 1, 0.3, 1]
        }}
        className="w-full max-w-md relative z-10">
        
        <div className="flex justify-center mb-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-2 rounded-xl shadow-glow">
              <Sparkles className="h-6 w-6" />
            </div>
          </Link>
        </div>

        <Card className="border-border/50 shadow-soft-lg bg-card/80 backdrop-blur-xl">
          <CardHeader className="space-y-2 text-center pb-6">
            <CardTitle className="text-2xl font-display font-bold tracking-tight">
              Welcome back
            </CardTitle>
            <CardDescription className="text-base">
              Enter your details to sign in to your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  icon={<Mail className="w-4 h-4" />}
                  className="h-12 bg-background/50" />
                
              </div>
              <div className="space-y-2">
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  icon={<Lock className="w-4 h-4" />}
                  className="h-12 bg-background/50" />
                
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary/50 bg-background/50" />
                
                <span className="text-muted-foreground">Remember me</span>
              </label>
              <button
                type="button"
                onClick={handlePasswordReset}
                className="text-primary hover:underline font-medium">
                Forgot password?
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              {(['buyer', 'seller'] as UserRole[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRole(item)}
                  className={`rounded-lg border px-3 py-2 capitalize ${
                    role === item ? 'border-primary bg-primary/10 text-primary' : 'border-border'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <Button className="w-full h-12 text-base font-medium mt-2 group" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/50"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground font-medium tracking-wider">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 bg-background/50 hover:bg-background"
                onClick={() => handleOAuth('google')}>
                
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4" />
                  
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853" />
                  
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05" />
                  
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335" />
                  
                </svg>
                Google
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 bg-background/50 hover:bg-background"
                onClick={() => handleOAuth('github')}>
                
                <Github className="w-5 h-5 mr-2" />
                GitHub
              </Button>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center border-t border-border/50 pt-6 pb-6">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link
                to="/signup"
                className="text-primary font-medium hover:underline">
                
                Sign up
              </Link>
            </p>
          </CardFooter>
        </Card>
      </motion.div>
    </div>);

}
export function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const { signup, oauthLogin } = useApp();
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [role, setRole] = React.useState<UserRole>('buyer');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (fullName.trim().length < 2) {
      toast.error('Please enter your full name');
      return;
    }
    if (!email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const user = await signup(fullName.trim(), email, password, role);
      toast.success(`Welcome to GridStore, ${user.name}`);
      redirectAfterAuth(navigate, user, from);
    } catch {
      toast.error('Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'github') => {
    const user = await oauthLogin(provider, role);
    toast.success(`${provider === 'google' ? 'Google' : 'GitHub'} account connected`);
    redirectAfterAuth(navigate, user, from);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/10 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{
          opacity: 0,
          y: 20
        }}
        animate={{
          opacity: 1,
          y: 0
        }}
        transition={{
          duration: 0.5,
          ease: [0.16, 1, 0.3, 1]
        }}
        className="w-full max-w-md relative z-10">
        
        <div className="flex justify-center mb-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-2 rounded-xl shadow-glow">
              <Sparkles className="h-6 w-6" />
            </div>
          </Link>
        </div>

        <Card className="border-border/50 shadow-soft-lg bg-card/80 backdrop-blur-xl">
          <CardHeader className="space-y-2 text-center pb-6">
            <CardTitle className="text-2xl font-display font-bold tracking-tight">
              Create an account
            </CardTitle>
            <CardDescription className="text-base">
              Join South Africa's smartest AI marketplace
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="text"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Full Name"
                  icon={<User className="w-4 h-4" />}
                  className="h-12 bg-background/50" />
                
              </div>
              <div className="space-y-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                  icon={<Mail className="w-4 h-4" />}
                  className="h-12 bg-background/50" />
                
              </div>
              <div className="space-y-2">
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Create a password"
                  icon={<Lock className="w-4 h-4" />}
                  className="h-12 bg-background/50" />
                
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {(['buyer', 'seller'] as UserRole[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setRole(item)}
                    className={`rounded-lg border px-3 py-2 capitalize ${
                      role === item ? 'border-primary bg-primary/10 text-primary' : 'border-border'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <Button className="w-full h-12 text-base font-medium mt-2 group" type="submit" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            </form>

            <p className="text-xs text-center text-muted-foreground mt-4">
              By clicking continue, you agree to our{' '}
              <Link to="/terms" className="underline hover:text-primary">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="underline hover:text-primary">
                Privacy Policy
              </Link>
              .
            </p>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/50"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground font-medium tracking-wider">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 bg-background/50 hover:bg-background"
                onClick={() => handleOAuth('google')}>
                
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4" />
                  
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853" />
                  
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05" />
                  
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335" />
                  
                </svg>
                Google
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 bg-background/50 hover:bg-background"
                onClick={() => handleOAuth('github')}>
                
                <Github className="w-5 h-5 mr-2" />
                GitHub
              </Button>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center border-t border-border/50 pt-6 pb-6">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-primary font-medium hover:underline">
                
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </motion.div>
    </div>);

}
