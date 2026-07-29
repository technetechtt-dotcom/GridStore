import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, ShieldCheck, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '../../components/design-system/EmptyState';
import { PageHeader } from '../../components/design-system/PageHeader';
import { StatCard } from '../../components/design-system/StatCard';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import type { Order } from '../../types';
import {
  apiGetOrders,
  apiListMyPayments,
  getAuthToken,
  isPlatformApiAvailable,
  type BuyerPayment,
} from '../../services/platformApi';

function formatRands(cents: number) {
  return `R ${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

export function WalletPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<BuyerPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const connected = isPlatformApiAvailable() && Boolean(getAuthToken());

  useEffect(() => {
    if (!connected) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void Promise.all([apiGetOrders(), apiListMyPayments()])
      .then(([nextOrders, nextPayments]) => {
        if (cancelled) return;
        setOrders(nextOrders);
        setPayments(nextPayments);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Unable to load wallet');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected]);

  const stats = useMemo(() => {
    const captured = payments
      .filter((payment) => ['captured', 'authorized'].includes(payment.status))
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    const refunded = payments
      .filter((payment) => ['refunded', 'partially_refunded'].includes(payment.status))
      .reduce((sum, payment) => sum + (payment.refundedCents ?? 0), 0);
    const escrow = orders
      .filter((order) => ['paid', 'processing', 'shipped'].includes(order.status))
      .reduce((sum, order) => sum + (order.totalCents ?? Math.round(order.total * 100)), 0);
    return { captured, refunded, escrow };
  }, [orders, payments]);

  if (!connected) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-10 animate-fade-in">
        <PageHeader
          eyebrow="Payments"
          title="GridMarket payments"
          description="Card and Instant EFT checkout runs through Paystack. There is no separate stored-value wallet yet."
        />
        <EmptyState
          className="mt-8"
          icon={Wallet}
          title="Sign in to view payment activity"
          description="Your captured payments and open order escrow appear here after checkout."
          actionLabel="Go to login"
          onAction={() => {
            window.location.href = '/login';
          }}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10 space-y-8 animate-fade-in">
      <PageHeader
        eyebrow="Payments"
        title="GridMarket payments"
        description="Live Paystack/sandbox payment intents for your account. ZAR only — no prepaid wallet top-ups."
        actions={
          <Button asChild variant="outline">
            <Link to="/orders">View orders</Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Captured / authorized"
          value={loading ? '…' : formatRands(stats.captured)}
          change="Provider payments"
          icon={Wallet}
        />
        <StatCard
          label="In fulfilment"
          value={loading ? '…' : formatRands(stats.escrow)}
          change="Paid orders not delivered"
          trend="neutral"
          icon={ShieldCheck}
        />
        <StatCard
          label="Refunded"
          value={loading ? '…' : formatRands(stats.refunded)}
          change="Completed refunds"
          icon={CreditCard}
        />
      </div>
      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">Payment activity</TabsTrigger>
          <TabsTrigger value="methods">How you pay</TabsTrigger>
        </TabsList>
        <TabsContent value="payments" className="space-y-3">
          {payments.length === 0 && !loading ? (
            <EmptyState
              title="No payments yet"
              description="Payments appear after you check out with card or Paystack."
              actionLabel="Browse marketplace"
              onAction={() => {
                window.location.href = '/marketplace';
              }}
            />
          ) : (
            payments.map((payment) => (
              <Card key={payment.id} className="border-border/60 shadow-soft">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="font-medium">{payment.providerReference ?? payment.id}</p>
                    <p className="text-sm text-muted-foreground">
                      Order {payment.orderId} · {payment.provider}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatRands(payment.amountCents)}</p>
                    <Badge variant="outline" className="mt-1 capitalize">
                      {payment.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
        <TabsContent value="methods">
          <EmptyState
            title="Pay at checkout"
            description="GridStore charges via Paystack (card / Instant EFT) when you place an order. Saved cards are managed by Paystack — we do not store card numbers."
            actionLabel="Go to checkout"
            onAction={() => {
              window.location.href = '/checkout';
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function PaymentMethodsPage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-10 animate-fade-in">
      <PageHeader
        eyebrow="Payments"
        title="Payment methods"
        description="Checkout uses Paystack in ZAR. Card details stay with the payment provider."
        actions={
          <Button asChild>
            <Link to="/wallet">View payment activity</Link>
          </Button>
        }
      />
      <Card className="mt-8 border-border/60 shadow-soft">
        <CardHeader>
          <CardTitle className="font-display">Supported at checkout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: 'Paystack card', type: 'card' },
            { label: 'Instant EFT (via Paystack)', type: 'eft' },
            { label: 'Manual EFT (seller confirmation)', type: 'manual' },
          ].map((method) => (
            <div key={method.label} className="flex items-center justify-between rounded-xl border p-4">
              <span>{method.label}</span>
              <Badge variant="outline">{method.type}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
