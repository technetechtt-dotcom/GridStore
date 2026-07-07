import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ADMIN_STATS, ADMIN_USERS } from '../../data/mock/platform';
import { EmptyState } from '../../components/design-system/EmptyState';
import { PageHeader } from '../../components/design-system/PageHeader';
import { StatCard } from '../../components/design-system/StatCard';
import { Badge } from '../../components/ui/badge';
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
import { Activity, Bot, Flag, Package, Shield, ShoppingCart, Users, Wallet } from 'lucide-react';

const CHART_DATA = [
  { month: 'Jan', gmv: 2.4, orders: 1200 },
  { month: 'Feb', gmv: 2.8, orders: 1380 },
  { month: 'Mar', gmv: 3.1, orders: 1520 },
  { month: 'Apr', gmv: 3.6, orders: 1710 },
  { month: 'May', gmv: 4.0, orders: 1890 },
  { month: 'Jun', gmv: 4.8, orders: 2140 },
];

function AdminChart() {
  return (
    <Card className="border-border/60 shadow-soft">
      <CardHeader>
        <CardTitle className="font-display">GMV & Orders</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={CHART_DATA}>
            <defs>
              <linearGradient id="gmv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="month" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip />
            <Area type="monotone" dataKey="gmv" stroke="hsl(var(--primary))" fill="url(#gmv)" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function AdminDashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ADMIN_STATS.map((stat) => (
          <StatCard key={stat.label} {...stat} icon={Activity} />
        ))}
      </div>
      <AdminChart />
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
                <TableHead>Trust</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ADMIN_USERS.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{user.status}</Badge>
                  </TableCell>
                  <TableCell>{user.trust}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminTablePage({
  title,
  description,
  columns,
  rows,
  icon: Icon,
}: {
  title: string;
  description: string;
  columns: string[];
  rows: string[][];
  icon: typeof Users;
}) {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title={title} description={description} />
      <Card className="border-border/60 shadow-soft">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={index}>
                  {row.map((cell) => (
                    <TableCell key={cell}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <EmptyState
        icon={Icon}
        title="Backend-ready module"
        description="This admin view is wired with realistic mock data and ready for API integration."
      />
    </div>
  );
}

export function AdminUsers() {
  return (
    <AdminTablePage
      title="Users"
      description="Manage buyers, sellers, moderators, and business accounts."
      icon={Users}
      columns={['Name', 'Role', 'Status', 'Trust']}
      rows={ADMIN_USERS.map((u) => [u.name, u.role, u.status, String(u.trust)])}
    />
  );
}

export function AdminListings() {
  return (
    <AdminTablePage
      title="Listings"
      description="Moderate products, services, rentals, and flagged content."
      icon={Package}
      columns={['Listing', 'Seller', 'Category', 'Status']}
      rows={[
        ['Sony a7 IV', 'CameraWorld ZA', 'Electronics', 'Active'],
        ['5kW Solar Kit', 'PowerSmart', 'Home & Garden', 'Active'],
        ['Studio Apartment', 'UrbanStay', 'Rentals', 'Review'],
      ]}
    />
  );
}

export function AdminOrders() {
  return (
    <AdminTablePage
      title="Orders"
      description="Track order lifecycle, refunds, and fulfillment exceptions."
      icon={ShoppingCart}
      columns={['Order', 'Buyer', 'Total', 'Status']}
      rows={[
        ['GS-928104', 'James K.', 'R 45,999', 'Shipped'],
        ['GS-928103', 'Thandi M.', 'R 3,899', 'Processing'],
        ['GS-928102', 'Nomsa D.', 'R 12,500', 'Delivered'],
      ]}
    />
  );
}

export function AdminPayments() {
  return (
    <AdminTablePage
      title="Payments"
      description="Monitor wallets, escrow, payouts, and payment provider health."
      icon={Wallet}
      columns={['Reference', 'Method', 'Amount', 'Status']}
      rows={[
        ['PAY-4412', 'Instant EFT', 'R 18,999', 'Settled'],
        ['PAY-4411', 'Card', 'R 4,250', 'Authorized'],
        ['PAY-4410', 'Wallet', 'R 850', 'Pending'],
      ]}
    />
  );
}

export function AdminDisputes() {
  return (
    <AdminTablePage
      title="Disputes"
      description="Resolve buyer-seller conflicts with evidence and trust signals."
      icon={Shield}
      columns={['Case', 'Type', 'Priority', 'Status']}
      rows={[
        ['DSP-102', 'Order not received', 'High', 'Open'],
        ['DSP-101', 'Item not as described', 'Medium', 'In review'],
        ['DSP-100', 'Refund request', 'Low', 'Resolved'],
      ]}
    />
  );
}

export function AdminModeration() {
  return (
    <AdminTablePage
      title="Content Moderation"
      description="Review reported listings, messages, and user-generated content."
      icon={Flag}
      columns={['Report', 'Target', 'Reason', 'Action']}
      rows={[
        ['RPT-88', 'Listing #4412', 'Suspected scam', 'Queue'],
        ['RPT-87', 'User @seller42', 'Harassment', 'Review'],
        ['RPT-86', 'Message thread', 'Spam', 'Auto-flagged'],
      ]}
    />
  );
}

export function AdminAnalytics() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Analytics" description="Platform-wide performance, cohorts, and conversion funnels." />
      <AdminChart />
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="regions">Regions</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <AdminChart />
        </TabsContent>
        <TabsContent value="categories">
          <EmptyState title="Category analytics" description="Category breakdown ready for API data." />
        </TabsContent>
        <TabsContent value="regions">
          <EmptyState title="Regional analytics" description="Province and city performance views." />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function AdminAiMonitoring() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="AI Monitoring"
        description="Track assistant usage, fraud models, listing generation, and recommendation quality."
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Assistant sessions" value="12,840" change="+22%" trend="up" icon={Bot} />
        <StatCard label="Fraud blocks" value="184" change="Last 7 days" trend="neutral" icon={Shield} />
        <StatCard label="Listing drafts" value="2,410" change="+15%" trend="up" icon={Package} />
      </div>
      <EmptyState
        icon={Bot}
        title="AI observability dashboard"
        description="Connect model telemetry, latency metrics, and quality scores from your AI backend."
      />
    </div>
  );
}

export function AdminSettings() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="System Settings" description="Feature flags, regions, payment providers, and platform configuration." />
      <Card className="border-border/60 shadow-soft">
        <CardContent className="space-y-4 p-6">
          {[
            'Enable AI Shopping Assistant',
            'Enable Escrow Payments',
            'Enable Seller Subscriptions',
            'Enable Instant EFT',
            'Enable Dark Mode Default',
          ].map((flag) => (
            <div key={flag} className="flex items-center justify-between rounded-xl border p-4">
              <div>
                <p className="font-medium">{flag}</p>
                <p className="text-sm text-muted-foreground">Feature flag · production</p>
              </div>
              <Badge variant="secondary">Enabled</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
