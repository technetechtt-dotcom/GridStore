import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Heart,
  Bell,
  User,
  Menu,
  Sparkles,
  Moon,
  Sun,
  ChevronDown,
  Globe,
  X } from
'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { MegaMenu } from './MegaMenu';
import { useTheme } from '../theme/ThemeProvider';
import { useApp } from '../../context/AppContext';
const SUB_NAV = [
{
  label: 'Marketplace',
  to: '/marketplace'
},
{
  label: 'Auctions',
  to: '/auctions'
},
{
  label: 'Services',
  to: '/services'
},
{
  label: 'Rentals',
  to: '/rentals'
},
{
  label: 'Jobs',
  to: '/jobs'
},
{
  label: 'Stores',
  to: '/store'
}];

export function Header() {
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { theme, toggleTheme } = useTheme();
  const { cartCount, unreadNotifications, user, logout } = useApp();
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  const openMega = () => {
    clearTimeout(closeTimer.current);
    setMegaOpen(true);
  };
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setMegaOpen(false), 120);
  };
  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    navigate(query ? `/marketplace?q=${encodeURIComponent(query)}` : '/marketplace');
    setMobileOpen(false);
  };
  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${isScrolled ? 'glass border-b border-border/50 shadow-sm' : 'bg-background border-b border-border'}`}>
      
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
            onClick={() => setMobileOpen((v) => !v)}>
            
            {mobileOpen ?
            <X className="h-5 w-5" /> :

            <Menu className="h-5 w-5" />
            }
          </Button>
          <Link to="/" className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="font-display font-bold text-xl hidden sm:inline-block tracking-tight">
              GridMarket <span className="text-primary">AI</span>
            </span>
          </Link>
        </div>

        {/* AI Search Bar */}
        <form className="flex-1 max-w-2xl hidden md:block relative group" onSubmit={submitSearch}>
          <Input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Ask AI to find anything — e.g. 'reliable plumber in Cape Town'"
            className="w-full rounded-full pr-24 h-11 bg-secondary/60 border-border/50 focus-visible:ring-primary/50"
            icon={<Sparkles className="h-5 w-5 text-primary" />}
            aria-label="AI search" />
          
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <Button size="sm" type="submit">
              Search
            </Button>
            <Badge
              variant="secondary"
              className="hidden lg:flex text-[10px] uppercase font-bold tracking-wider">
              
              AI Search
            </Badge>
          </div>
        </form>

        {/* Actions */}
        <div className="flex items-center gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="text-muted-foreground hover:text-foreground">
            
            {theme === 'dark' ?
            <Sun className="h-5 w-5" /> :

            <Moon className="h-5 w-5" />
            }
          </Button>

          <Button
            asChild
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground hidden sm:flex"
            aria-label="Wishlist">
            
            <Link to="/wishlist">
              <Heart className="h-5 w-5" />
            </Link>
          </Button>

          <Button
            asChild
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground relative"
            aria-label="Notifications">
            
            <Link to="/notifications">
              <Bell className="h-5 w-5" />
              {unreadNotifications > 0 ? (
                <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full border-2 border-background" />
              ) : null}
            </Link>
          </Button>

          <Button
            asChild
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground relative"
            aria-label="Cart">
            
            <Link to="/cart">
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 ? (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold min-w-4 h-4 rounded-full flex items-center justify-center px-1">
                  {cartCount}
                </span>
              ) : null}
            </Link>
          </Button>

          <div className="h-8 w-px bg-border mx-2 hidden sm:block" />

          <Button
            asChild
            variant="ghost"
            className="hidden sm:flex items-center gap-2 rounded-full pl-2 pr-4 border border-border/50 hover:bg-accent/10">
            
            <Link to={user ? '/dashboard' : '/login'}>
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                <User className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-medium">{user ? user.name : 'Sign In'}</span>
            </Link>
          </Button>
          {user ? (
            <Button asChild variant="ghost" className="hidden lg:flex">
              <Link to="/orders">Orders</Link>
            </Button>
          ) : null}
          {user ? (
            <Button variant="ghost" className="hidden sm:flex" onClick={logout}>
              Sign out
            </Button>
          ) : null}
        </div>
      </div>

      {/* Categories Sub-nav with mega menu */}
      <div className="hidden md:block border-t border-border/50 bg-background/50 backdrop-blur-md">
        <div className="container mx-auto px-4 flex items-center gap-8 h-12 text-sm font-medium text-muted-foreground">
          <button
            onMouseEnter={openMega}
            onMouseLeave={scheduleClose}
            onClick={() => setMegaOpen((v) => !v)}
            className="flex items-center gap-1.5 hover:text-primary transition-colors"
            aria-expanded={megaOpen}>
            
            <Menu className="h-4 w-4" /> All Categories
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${megaOpen ? 'rotate-180' : ''}`} />
            
          </button>
          {SUB_NAV.map((item) =>
          <Link
            key={item.label}
            to={item.to}
            className="hover:text-primary transition-colors">
            
              {item.label}
            </Link>
          )}
          <Link
            to="/settings/region"
            className="ml-auto flex items-center gap-1.5 hover:text-primary transition-colors">
            <Globe className="h-4 w-4" /> South Africa · ZAR
          </Link>
        </div>
        <div
          onMouseEnter={openMega}
          onMouseLeave={scheduleClose}
          className="relative">
          
          <MegaMenu open={megaOpen} />
        </div>
      </div>

      {/* Mobile menu drawer */}
      {mobileOpen &&
      <div className="md:hidden border-t border-border bg-background px-4 py-4 space-y-4">
          <form className="flex gap-2" onSubmit={submitSearch}>
            <Input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Ask AI to find anything..."
              icon={<Sparkles className="h-5 w-5 text-primary" />}
              className="rounded-full bg-secondary/60"
              aria-label="AI search"
            />
            <Button type="submit">Go</Button>
          </form>
        
          <nav className="grid grid-cols-2 gap-2">
            {SUB_NAV.map((item) =>
          <Link
            key={item.label}
            to={item.to}
            onClick={() => setMobileOpen(false)}
            className="px-3 py-2 rounded-lg bg-secondary/50 text-sm font-medium hover:bg-secondary transition-colors">
            
                {item.label}
              </Link>
          )}
          </nav>
        </div>
      }
    </header>);

}
