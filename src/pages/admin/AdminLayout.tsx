import { NavLink, Outlet } from 'react-router-dom';
import {
  Activity,
  Bot,
  Flag,
  LayoutDashboard,
  Package,
  Settings,
  Shield,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../components/design-system/PageHeader';

const ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/listings', label: 'Listings', icon: Package },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/admin/payments', label: 'Payments', icon: Wallet },
  { to: '/admin/disputes', label: 'Disputes', icon: Shield },
  { to: '/admin/moderation', label: 'Moderation', icon: Flag },
  { to: '/admin/analytics', label: 'Analytics', icon: Activity },
  { to: '/admin/ai', label: 'AI Monitoring', icon: Bot },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminLayout() {
  return (
    <div className="container mx-auto px-4 py-8">
      <PageHeader
        eyebrow="Ops"
        title="Platform Ops Dashboard"
        description="Manage users, content, sales, payments, and trust signals across GridMarket AI."
      />
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-2xl border bg-card p-3 shadow-soft h-fit lg:sticky lg:top-24">
          <nav className="space-y-1">
            {ADMIN_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-soft'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
