import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Package, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '../../components/design-system/EmptyState';
import { PageHeader } from '../../components/design-system/PageHeader';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Progress } from '../../components/ui/progress';
import type { Order } from '../../types';
import {
  apiGetOrders,
  apiListShippingEvents,
  apiTrackShipment,
  getAuthToken,
  isPlatformApiAvailable,
  type ShippingEvent,
  type TrackingLookup,
} from '../../services/platformApi';

function progressForStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes('deliver')) return 100;
  if (normalized.includes('out_for_delivery') || normalized.includes('transit')) return 70;
  if (normalized.includes('ship') || normalized.includes('picked')) return 45;
  if (normalized.includes('label') || normalized.includes('created')) return 20;
  return 35;
}

function DeliveryCard({
  order,
  events,
}: {
  order: Order;
  events: ShippingEvent[];
}) {
  const latest = events[events.length - 1];
  const status = latest?.status ?? order.status;
  const carrier = latest?.carrier ?? 'Courier';
  const tracking = latest?.trackingNumber ?? order.trackingNumber;

  return (
    <Card className="border-border/60 shadow-soft overflow-hidden">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display font-semibold">{order.id}</p>
              <p className="text-sm text-muted-foreground">
                {carrier}
                {tracking ? ` · ${tracking}` : ''}
              </p>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {order.deliveryAddress}
              </div>
              {events.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {events.slice(-3).map((event) => (
                    <li key={event.id}>
                      {new Date(event.createdAt).toLocaleString()} — {event.status}
                      {event.location ? ` @ ${event.location}` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
          <Badge variant={order.status === 'delivered' ? 'secondary' : 'default'}>{status}</Badge>
        </div>
        <Progress value={progressForStatus(status)} className="mt-4" />
      </CardContent>
    </Card>
  );
}

export function DeliveryTrackingPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [eventsByOrder, setEventsByOrder] = useState<Record<string, ShippingEvent[]>>({});
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState<TrackingLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const connected = isPlatformApiAvailable() && Boolean(getAuthToken());

  useEffect(() => {
    if (!connected) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await apiGetOrders();
        const shippable = rows.filter((order) =>
          ['processing', 'shipped', 'delivered'].includes(order.status)
        );
        if (cancelled) return;
        setOrders(shippable);
        const entries = await Promise.all(
          shippable.map(async (order) => {
            try {
              const events = await apiListShippingEvents(order.id);
              return [order.id, events] as const;
            } catch {
              return [order.id, [] as ShippingEvent[]] as const;
            }
          })
        );
        if (!cancelled) {
          setEventsByOrder(Object.fromEntries(entries));
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Unable to load deliveries');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected]);

  const visibleOrders = useMemo(() => {
    if (!lookup) return orders;
    return orders.filter((order) => order.id === lookup.orderId);
  }, [lookup, orders]);

  async function trackParcel() {
    const trackingNumber = query.trim();
    if (!trackingNumber) return;
    try {
      const result = await apiTrackShipment(trackingNumber);
      setLookup(result);
      setEventsByOrder((prev) => ({ ...prev, [result.orderId]: result.events }));
      toast.success(`Found shipment for order ${result.orderId}`);
    } catch (error) {
      setLookup(null);
      toast.error(error instanceof Error ? error.message : 'Tracking number not found');
    }
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-10 space-y-8 animate-fade-in">
      <PageHeader
        eyebrow="Delivery"
        title="Track your deliveries"
        description="Live tracking from your GridStore shipping events. Carrier label APIs are not connected yet — tracking numbers are recorded when sellers ship."
      />

      {!connected ? (
        <EmptyState
          icon={Package}
          title="Sign in to track deliveries"
          description="Connect to the platform API and sign in to see live shipment events."
          actionLabel="Go to login"
          onAction={() => {
            window.location.href = '/login';
          }}
        />
      ) : (
        <>
          <Card className="border-border/60 shadow-soft">
            <CardContent className="flex flex-col gap-3 p-5 md:flex-row">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Enter tracking number"
                className="md:flex-1"
              />
              <Button onClick={() => void trackParcel()}>Track parcel</Button>
            </CardContent>
          </Card>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading deliveries…</p>
          ) : (
            <div className="space-y-4">
              {lookup && !orders.some((order) => order.id === lookup.orderId) ? (
                <DeliveryCard
                  order={{
                    id: lookup.orderId,
                    status: lookup.status as Order['status'],
                    paymentStatus: 'paid',
                    total: 0,
                    deliveryAddress: lookup.deliveryAddress,
                    trackingNumber: lookup.trackingNumber,
                    receiptNumber: lookup.orderId,
                    createdAt: lookup.events[0]?.createdAt ?? new Date().toISOString(),
                    lines: [],
                  }}
                  events={lookup.events}
                />
              ) : null}
              {visibleOrders.map((order) => (
                <DeliveryCard key={order.id} order={order} events={eventsByOrder[order.id] ?? []} />
              ))}
              {!loading && visibleOrders.length === 0 && !lookup ? (
                <EmptyState
                  icon={Package}
                  title="No active deliveries"
                  description="Shipments appear here once an order is processing or shipped."
                  actionLabel="View orders"
                  onAction={() => {
                    window.location.href = '/orders';
                  }}
                />
              ) : null}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Need help? <Link className="underline" to="/orders">Open your orders</Link> to start a return or dispute.
          </p>
        </>
      )}
    </div>
  );
}
