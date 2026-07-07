import { MapPin, Package, Truck } from 'lucide-react';
import { DELIVERY_ORDERS } from '../../data/mock/platform';
import { EmptyState } from '../../components/design-system/EmptyState';
import { PageHeader } from '../../components/design-system/PageHeader';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Progress } from '../../components/ui/progress';

export function DeliveryTrackingPage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-10 space-y-8 animate-fade-in">
      <PageHeader
        eyebrow="Delivery"
        title="Track your deliveries"
        description="Courier selection, live tracking, pickup points, and delivery estimates."
        actions={<Button variant="outline">Shipping labels</Button>}
      />

      <Card className="border-border/60 shadow-soft">
        <CardContent className="flex flex-col gap-3 p-5 md:flex-row">
          <Input placeholder="Enter tracking number e.g. TRK-9281" className="md:flex-1" />
          <Button>Track parcel</Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {DELIVERY_ORDERS.map((order) => (
          <Card key={order.id} className="border-border/60 shadow-soft overflow-hidden">
            <CardContent className="p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="rounded-xl bg-primary/10 p-3 text-primary">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-display font-semibold">{order.id}</p>
                    <p className="text-sm text-muted-foreground">{order.courier} · {order.destination}</p>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      ETA {order.eta}
                    </div>
                  </div>
                </div>
                <Badge variant={order.status === 'Delivered' ? 'secondary' : 'default'}>{order.status}</Badge>
              </div>
              <Progress value={order.status === 'Delivered' ? 100 : order.status === 'In transit' ? 65 : 85} className="mt-4" />
            </CardContent>
          </Card>
        ))}
      </div>

      {DELIVERY_ORDERS.length === 0 ? (
        <EmptyState icon={Package} title="No active deliveries" description="Your shipments will appear here." />
      ) : null}
    </div>
  );
}
