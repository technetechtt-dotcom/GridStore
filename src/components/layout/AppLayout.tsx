import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { MobileBottomNav } from './MobileBottomNav';
import { DemoModeBanner } from '../common/DemoModeBanner';
import { CommandPalette } from './CommandPalette';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

export function AppLayout() {
  const { pathname } = useLocation();
  useKeyboardShortcuts();
  // Scroll to top on route change for a native-app feel.
  useEffect(() => {
    window.scrollTo({
      top: 0
    });
  }, [pathname]);
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/30">
      <DemoModeBanner />
      <Header />
      <CommandPalette />
      <main className="flex-1 pb-16 md:pb-0">
        <Outlet />
      </main>
      <Footer />
      <MobileBottomNav />
    </div>);

}