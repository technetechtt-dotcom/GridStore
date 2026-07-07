import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  CreditCard,
  Home,
  LayoutDashboard,
  MessageSquare,
  Package,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  User,
  Wallet,
  Wrench,
} from 'lucide-react';
import { registerShortcut } from '../../hooks/useKeyboardShortcuts';
import { Dialog, DialogContent } from '../ui/dialog';

const NAV_ITEMS = [
  { label: 'Home', to: '/', icon: Home, group: 'Navigate' },
  { label: 'Marketplace', to: '/marketplace', icon: ShoppingBag, group: 'Navigate' },
  { label: 'Services', to: '/services', icon: Wrench, group: 'Navigate' },
  { label: 'Rentals', to: '/rentals', icon: Package, group: 'Navigate' },
  { label: 'Jobs', to: '/jobs', icon: Briefcase, group: 'Navigate' },
  { label: 'Stores', to: '/store', icon: Store, group: 'Navigate' },
  { label: 'Buyer Dashboard', to: '/dashboard', icon: LayoutDashboard, group: 'Account' },
  { label: 'Seller Dashboard', to: '/seller', icon: Store, group: 'Account' },
  { label: 'Messages', to: '/messages', icon: MessageSquare, group: 'Account' },
  { label: 'Wallet', to: '/payments/wallet', icon: Wallet, group: 'Payments' },
  { label: 'Delivery Tracking', to: '/delivery/tracking', icon: Truck, group: 'Logistics' },
  { label: 'Trust & Safety', to: '/trust-safety', icon: Shield, group: 'Support' },
  { label: 'Admin Panel', to: '/admin', icon: Settings, group: 'Admin' },
  { label: 'AI Listing Tools', to: '/seller/ai-listing', icon: Sparkles, group: 'AI' },
  { label: 'Profile Settings', to: '/profile/settings', icon: User, group: 'Account' },
  { label: 'Checkout', to: '/checkout', icon: CreditCard, group: 'Shop' },
];

export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    registerShortcut('mod+k', () => setOpen(true));
    registerShortcut('?', () => setOpen(true));
  }, []);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              placeholder="Search pages, actions, and AI tools..."
              className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>
            {['Navigate', 'Shop', 'Account', 'Payments', 'Logistics', 'AI', 'Admin', 'Support'].map(
              (group) => {
                const items = NAV_ITEMS.filter((item) => item.group === group);
                if (!items.length) return null;
                return (
                  <Command.Group key={group} heading={group}>
                    {items.map((item) => (
                      <Command.Item
                        key={item.to}
                        value={`${item.label} ${item.to}`}
                        onSelect={() => go(item.to)}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm aria-selected:bg-accent"
                      >
                        <item.icon className="h-4 w-4 text-muted-foreground" />
                        {item.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              }
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
