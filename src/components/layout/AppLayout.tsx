import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { MobileBottomNav } from './MobileBottomNav';
import { PlatformConnectionBanner } from '../common/PlatformConnectionBanner';
import { CommandPalette } from './CommandPalette';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useApp } from '../../context/AppContext';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

function parsePositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const IDLE_LIMIT_MS = parsePositiveNumber(import.meta.env.VITE_IDLE_TIMEOUT_MS, 20 * 60 * 1000);
const PROMPT_TIMEOUT_SECONDS = parsePositiveNumber(import.meta.env.VITE_IDLE_PROMPT_SECONDS, 30);
const PROMPT_TIMEOUT_MS = PROMPT_TIMEOUT_SECONDS * 1000;

export function AppLayout() {
  const { pathname } = useLocation();
  const { user, logout } = useApp();
  const [showIdlePrompt, setShowIdlePrompt] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(PROMPT_TIMEOUT_SECONDS);
  const idleTimerRef = useRef<number | null>(null);
  const promptTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  useKeyboardShortcuts();

  const clearInactivityTimers = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (promptTimerRef.current !== null) {
      window.clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const triggerIdlePrompt = useCallback(() => {
    setShowIdlePrompt(true);
    setSecondsRemaining(PROMPT_TIMEOUT_SECONDS);
    promptTimerRef.current = window.setTimeout(() => {
      setShowIdlePrompt(false);
      logout();
    }, PROMPT_TIMEOUT_MS);
    countdownIntervalRef.current = window.setInterval(() => {
      setSecondsRemaining((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
  }, [logout]);

  const armIdleTimer = useCallback(() => {
    if (!user || showIdlePrompt) return;
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = window.setTimeout(triggerIdlePrompt, IDLE_LIMIT_MS);
  }, [showIdlePrompt, triggerIdlePrompt, user]);

  const handleContinueSession = useCallback(() => {
    clearInactivityTimers();
    setShowIdlePrompt(false);
    setSecondsRemaining(PROMPT_TIMEOUT_SECONDS);
    armIdleTimer();
  }, [armIdleTimer, clearInactivityTimers]);

  const handleLogoutNow = useCallback(() => {
    clearInactivityTimers();
    setShowIdlePrompt(false);
    logout();
  }, [clearInactivityTimers, logout]);

  useEffect(() => {
    if (!user) {
      clearInactivityTimers();
      setShowIdlePrompt(false);
      setSecondsRemaining(PROMPT_TIMEOUT_SECONDS);
      return;
    }

    const handleActivity = () => {
      if (!showIdlePrompt) {
        armIdleTimer();
      }
    };

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
    ];
    events.forEach((eventName) =>
      window.addEventListener(eventName, handleActivity, { passive: true })
    );

    armIdleTimer();

    return () => {
      events.forEach((eventName) =>
        window.removeEventListener(eventName, handleActivity)
      );
      clearInactivityTimers();
    };
  }, [armIdleTimer, clearInactivityTimers, showIdlePrompt, user]);

  const countdownLabel = useMemo(() => {
    if (secondsRemaining <= 0) return 'Logging out...';
    return `${secondsRemaining} second${secondsRemaining === 1 ? '' : 's'}`;
  }, [secondsRemaining]);
  const idleMinutesLabel = useMemo(() => {
    const minutes = Math.max(1, Math.round(IDLE_LIMIT_MS / 60000));
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }, []);

  // Scroll to top on route change for a native-app feel.
  useEffect(() => {
    window.scrollTo({
      top: 0
    });
  }, [pathname]);
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/30">
      <PlatformConnectionBanner />
      <Header />
      <CommandPalette />
      <main className="flex-1 pb-16 md:pb-0">
        <Outlet />
      </main>
      <Footer />
      <MobileBottomNav />
      <Dialog open={showIdlePrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Still there?</DialogTitle>
            <DialogDescription>
              You have been inactive for {idleMinutesLabel}. Continue your session or you will be signed out in {countdownLabel}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleLogoutNow}>
              Logout
            </Button>
            <Button onClick={handleContinueSession}>Continue session</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>);

}