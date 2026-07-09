import React from 'react';
import { toast } from 'sonner';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  Bot,
  Flag,
  Loader2,
  Package,
  RefreshCw,
  Shield,
  ShoppingCart,
  Store,
  Users,
  Wallet,
  Wrench,
  Gavel,
  ShoppingBag,
} from 'lucide-react';
import { EmptyState } from '../../components/design-system/EmptyState';
import { PageHeader } from '../../components/design-system/PageHeader';
import { StatCard } from '../../components/design-system/StatCard';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  apiGetAdminAnalytics,
  apiGetAdminListings,
  apiGetAdminOrders,
  apiGetAdminPayments,
  apiGetAdminReports,
  apiGetAdminSettings,
  apiGetAdminStats,
  apiGetAdminStores,
  apiGetAdminUsers,
  apiUpdateAdminListing,
  apiUpdateAdminOrder,
  apiUpdateAdminReport,
  apiUpdateAdminStore,
  apiUpdateAdminUser,
  type AdminAnalyticsPoint,
  type AdminOrderRow,
  type AdminPaymentRow,
  type AdminStats,
  type AdminStoreRow,
} from '../../services/adminApi';
import type { AppUser, SellerListing, StoreProfile, TrustReport } from '../../types';

function formatCurrency(value: number) {
  return `R ${Math.round(value).toLocaleString('en-ZA')}`;
}

export function useAdminResource<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ops data');
    } finally {
      setLoading(false);
    }
  }, deps);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}

export function OpsLoading({ label = 'Loading ops data…' }: { label?: string }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      {label}
    </div>
  );
}

export function OpsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive/30">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-sm text-destructive">{message}</p>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

function OpsChart({ data }: { data: AdminAnalyticsPoint[] }) {
  return (
    <Card className="border-border/60 shadow-soft">
      <CardHeader>
        <CardTitle className="font-display">Sales & Orders</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="opsRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue (k)"
              stroke="hsl(var(--primary))"
              fill="url(#opsRevenue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function statusBadgeVariant(status: string) {
  if (['active', 'paid', 'Settled', 'resolved', 'confirmed', 'delivered'].includes(status)) {
    return 'default' as const;
  }
  if (['flagged', 'open', 'Pending', 'requested', 'requires_provider'].includes(status)) {
    return 'destructive' as const;
  }
  return 'secondary' as const;
}

export function AdminDashboard() {
  const statsQuery = useAdminResource(apiGetAdminStats);
  const analyticsQuery = useAdminResource(apiGetAdminAnalytics);
  const usersQuery = useAdminResource(apiGetAdminUsers);

  if (statsQuery.loading || analyticsQuery.loading || usersQuery.loading) {
    return <OpsLoading />;
  }

  if (statsQuery.error || analyticsQuery.error || usersQuery.error) {
    return (
      <OpsError
        message={statsQuery.error ?? analyticsQuery.error ?? usersQuery.error ?? 'Unknown error'}
        onRetry={() => {
          void statsQuery.refresh();
          void analyticsQuery.refresh();
          void usersQuery.refresh();
        }}
      />
    );
  }

  const stats = statsQuery.data as AdminStats;
  const cards = [
    { label: 'Total users', value: String(stats.totalUsers), icon: Users },
    { label: 'Orders', value: String(stats.totalOrders), icon: ShoppingCart },
    { label: 'Listings', value: String(stats.totalListings), icon: Package },
    { label: 'Stores', value: String(stats.totalStores), icon: Store },
    { label: 'Marketplace', value: String(stats.totalMarketplaceProducts), icon: ShoppingBag },
    { label: 'Live auctions', value: String(stats.liveAuctions), icon: Gavel },
    { label: 'Services', value: String(stats.totalServices), icon: Wrench },
    {
      label: 'Revenue',
      value: formatCurrency(stats.revenueTotal),
      change: `${stats.pendingBookings} pending bookings`,
      icon: Wallet,
    },
    {
      label: 'Open reports',
      value: String(stats.openReports),
      change: 'Needs moderation',
      trend: stats.openReports > 0 ? ('down' as const) : ('neutral' as const),
      icon: Flag,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void statsQuery.refresh();
            void analyticsQuery.refresh();
            void usersQuery.refresh();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        {cards.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>
      <OpsChart data={analyticsQuery.data ?? []} />
      <Card className="border-border/60 shadow-soft">
        <CardHeader>
          <CardTitle className="font-display">Recent users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usersQuery.data ?? []).slice(0, 8).map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>
                    <Badge variant={user.verified ? 'default' : 'secondary'}>
                      {user.verified ? 'Verified' : 'Pending'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminUsers() {
  const { data, loading, error, refresh } = useAdminResource(apiGetAdminUsers);

  const toggleVerified = async (user: AppUser) => {
    try {
      await apiUpdateAdminUser(user.id, { verified: !user.verified });
      toast.success(`${user.name} verification updated`);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  };

  if (loading) return <OpsLoading />;
  if (error) return <OpsError message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Users"
        description="Manage buyers, sellers, moderators, and admin accounts."
      />
      <Card className="border-border/60 shadow-soft">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>
                    <Badge variant={user.verified ? 'default' : 'secondary'}>
                      {user.verified ? 'Verified' : 'Pending'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => void toggleVerified(user)}>
                      {user.verified ? 'Revoke' : 'Verify'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminStores() {
  const { data, loading, error, refresh } = useAdminResource(apiGetAdminStores);

  const setStatus = async (store: AdminStoreRow, status: StoreProfile['status']) => {
    try {
      await apiUpdateAdminStore(store.id, { status });
      toast.success(`${store.name} marked ${status}`);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const toggleVerified = async (store: AdminStoreRow) => {
    try {
      await apiUpdateAdminStore(store.id, { verified: !store.verified });
      toast.success(`${store.name} verification updated`);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  };

  if (loading) return <OpsLoading />;
  if (error) return <OpsError message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Stores"
        description="Review seller storefronts, verify shops, and pause listings that need moderation."
      />
      <Card className="border-border/60 shadow-soft">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((store) => (
                <TableRow key={store.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{store.name}</p>
                      <p className="text-xs text-muted-foreground">{store.followers} followers</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{store.ownerName}</p>
                      <p className="text-xs text-muted-foreground">{store.ownerEmail}</p>
                    </div>
                  </TableCell>
                  <TableCell>{store.category}</TableCell>
                  <TableCell>{store.location}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(store.status ?? 'active')}>
                      {store.status ?? 'active'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={store.verified ? 'default' : 'secondary'}>
                      {store.verified ? 'Verified' : 'Pending'}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => void toggleVerified(store)}>
                      {store.verified ? 'Revoke' : 'Verify'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void setStatus(store, 'active')}>
                      Activate
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void setStatus(store, 'paused')}>
                      Pause
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void setStatus(store, 'draft')}>
                      Draft
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminListings() {
  const { data, loading, error, refresh } = useAdminResource(apiGetAdminListings);

  const setStatus = async (listing: SellerListing, status: SellerListing['status']) => {
    try {
      await apiUpdateAdminListing(listing.id, status);
      toast.success(`Listing marked ${status}`);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  };

  if (loading) return <OpsLoading />;
  if (error) return <OpsError message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Content" description="Moderate listings, pause risky inventory, and flag scams." />
      <Card className="border-border/60 shadow-soft">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Listing</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((listing) => (
                <TableRow key={listing.id}>
                  <TableCell className="font-medium">{listing.title}</TableCell>
                  <TableCell>{listing.seller}</TableCell>
                  <TableCell>{listing.category}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(listing.status)}>{listing.status}</Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => void setStatus(listing, 'active')}>
                      Activate
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void setStatus(listing, 'paused')}>
                      Pause
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => void setStatus(listing, 'flagged')}>
                      Flag
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminOrders() {
  const { data, loading, error, refresh } = useAdminResource(apiGetAdminOrders);

  const advanceOrder = async (order: AdminOrderRow) => {
    const nextStatus =
      order.status === 'paid'
        ? 'processing'
        : order.status === 'processing'
          ? 'shipped'
          : order.status === 'shipped'
            ? 'delivered'
            : order.status;

    try {
      await apiUpdateAdminOrder(order.id, { status: nextStatus });
      toast.success(`Order ${order.receiptNumber} updated`);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  };

  if (loading) return <OpsLoading />;
  if (error) return <OpsError message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Sales & Orders" description="Track fulfillment, refunds, and delivery status." />
      {(data ?? []).length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="No orders yet"
          description="Orders created through checkout will appear here for ops review."
        />
      ) : (
        <Card className="border-border/60 shadow-soft">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>{order.receiptNumber}</TableCell>
                    <TableCell>{order.buyerName}</TableCell>
                    <TableCell>{formatCurrency(order.total)}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(order.status)}>{order.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => void advanceOrder(order)}>
                        Advance
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function AdminPayments() {
  const { data, loading, error, refresh } = useAdminResource(apiGetAdminPayments);

  if (loading) return <OpsLoading />;
  if (error) return <OpsError message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Payments" description="Monitor settlement status derived from live orders." />
      <Card className="border-border/60 shadow-soft">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((payment: AdminPaymentRow) => (
                <TableRow key={payment.id}>
                  <TableCell>{payment.reference}</TableCell>
                  <TableCell>{payment.buyer}</TableCell>
                  <TableCell>{payment.method}</TableCell>
                  <TableCell>{formatCurrency(payment.amount)}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(payment.status)}>{payment.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportsTable({
  title,
  description,
  onResolve,
}: {
  title: string;
  description: string;
  onResolve: (report: TrustReport) => Promise<void>;
}) {
  const { data, loading, error, refresh } = useAdminResource(apiGetAdminReports);

  if (loading) return <OpsLoading />;
  if (error) return <OpsError message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title={title} description={description} />
      {(data ?? []).length === 0 ? (
        <EmptyState icon={Shield} title="No reports" description="Trust reports submitted by users appear here." />
      ) : (
        <Card className="border-border/60 shadow-soft">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>{report.targetId}</TableCell>
                    <TableCell>{report.targetType}</TableCell>
                    <TableCell className="max-w-xs truncate">{report.reason}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(report.status)}>{report.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await onResolve({ ...report, status: 'in_review' });
                          void refresh();
                        }}
                      >
                        Review
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await onResolve({ ...report, status: 'resolved' });
                          void refresh();
                        }}
                      >
                        Resolve
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function AdminDisputes() {
  const handleResolve = async (report: TrustReport) => {
    try {
      await apiUpdateAdminReport(report.id, report.status);
      toast.success('Report updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
      throw err;
    }
  };

  return (
    <ReportsTable
      title="Disputes"
      description="Resolve buyer-seller conflicts and trust escalations."
      onResolve={handleResolve}
    />
  );
}

export function AdminModeration() {
  const handleResolve = async (report: TrustReport) => {
    await apiUpdateAdminReport(report.id, report.status);
    toast.success('Moderation action saved');
  };

  return (
    <ReportsTable
      title="Content Moderation"
      description="Review flagged listings, users, and order disputes."
      onResolve={handleResolve}
    />
  );
}

export function AdminAnalytics() {
  const analyticsQuery = useAdminResource(apiGetAdminAnalytics);
  const statsQuery = useAdminResource(apiGetAdminStats);

  if (analyticsQuery.loading || statsQuery.loading) return <OpsLoading />;
  if (analyticsQuery.error || statsQuery.error) {
    return (
      <OpsError
        message={analyticsQuery.error ?? statsQuery.error ?? 'Failed to load analytics'}
        onRetry={() => {
          void analyticsQuery.refresh();
          void statsQuery.refresh();
        }}
      />
    );
  }

  const stats = statsQuery.data as AdminStats;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Analytics" description="Platform-wide sales performance and ops KPIs." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="GMV" value={formatCurrency(stats.revenueTotal)} icon={Activity} />
        <StatCard label="Orders" value={String(stats.totalOrders)} icon={ShoppingCart} />
        <StatCard label="Active listings" value={String(stats.totalListings)} icon={Package} />
      </div>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ops">Ops load</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OpsChart data={analyticsQuery.data ?? []} />
        </TabsContent>
        <TabsContent value="ops">
          <div className="grid gap-4 md:grid-cols-2">
            <StatCard label="Open reports" value={String(stats.openReports)} icon={Flag} />
            <StatCard label="Pending bookings" value={String(stats.pendingBookings)} icon={Activity} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function AdminAiMonitoring() {
  const statsQuery = useAdminResource(apiGetAdminStats);

  if (statsQuery.loading) return <OpsLoading />;
  if (statsQuery.error) return <OpsError message={statsQuery.error} onRetry={statsQuery.refresh} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="AI Monitoring"
        description="Assistant usage and listing automation health (ops view)."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Platform users" value={String(statsQuery.data?.totalUsers ?? 0)} icon={Bot} />
        <StatCard label="Open trust flags" value={String(statsQuery.data?.openReports ?? 0)} icon={Shield} />
        <StatCard label="Live listings" value={String(statsQuery.data?.totalListings ?? 0)} icon={Package} />
      </div>
      <EmptyState
        icon={Bot}
        title="Model telemetry"
        description="Connect your AI provider dashboard for latency, token usage, and quality scores."
      />
    </div>
  );
}

export function AdminSettings() {
  const { data, loading, error, refresh } = useAdminResource(apiGetAdminSettings);

  if (loading) return <OpsLoading />;
  if (error) return <OpsError message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="System Settings" description="Feature flags and platform configuration." />
      <Card className="border-border/60 shadow-soft">
        <CardContent className="space-y-4 p-6">
          {(data?.features ?? []).map((flag) => (
            <div key={flag.key} className="flex items-center justify-between rounded-xl border p-4">
              <div>
                <p className="font-medium">{flag.label}</p>
                <p className="text-sm text-muted-foreground">
                  Feature flag · {data?.environment ?? 'production'}
                </p>
              </div>
              <Badge variant={flag.enabled ? 'default' : 'secondary'}>
                {flag.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
