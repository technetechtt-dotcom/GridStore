import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Search, Plus, MessageCircle, User } from 'lucide-react';
import { cn } from '../lib/utils';
const ITEMS = [
{
  label: 'Home',
  icon: Home,
  to: '/'
},
{
  label: 'Explore',
  icon: Search,
  to: '/marketplace'
},
{
  label: 'Messages',
  icon: MessageCircle,
  to: '/messages'
},
{
  label: 'Profile',
  icon: User,
  to: '/dashboard'
}];

export function MobileBottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 glass border-t border-border">
      <div className="relative flex items-center justify-around h-16 px-2">
        {ITEMS.slice(0, 2).map((item) =>
        <NavItem key={item.label} item={item} active={pathname === item.to} />
        )}

        <Link
          to="/seller"
          aria-label="Sell"
          className="relative -mt-8 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-glow active:scale-95 transition-transform">
          
          <Plus className="w-6 h-6" />
        </Link>

        {ITEMS.slice(2).map((item) =>
        <NavItem key={item.label} item={item} active={pathname === item.to} />
        )}
      </div>
    </nav>);

}
function NavItem({
  item,
  active







}: {item: {label: string;icon: typeof Home;to: string;};active: boolean;}) {
  return (
    <Link
      to={item.to}
      className={cn(
        'flex flex-col items-center justify-center gap-1 w-16 text-[11px] font-medium transition-colors',
        active ? 'text-primary' : 'text-muted-foreground'
      )}>
      
      <item.icon className="w-5 h-5" />
      {item.label}
    </Link>);

}