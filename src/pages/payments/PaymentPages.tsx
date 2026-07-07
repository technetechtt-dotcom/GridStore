import { CreditCard, Gift, ShieldCheck, Wallet } from 'lucide-react';
import { PAYMENT_METHODS } from '../../data/mock/platform';
import { EmptyState } from '../../components/design-system/EmptyState';
import { PageHeader } from '../../components/design-system/PageHeader';
import { StatCard } from '../../components/design-system/StatCard';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';

export function WalletPage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-10 space-y-8 animate-fade-in">
      <PageHeader
        eyebrow="Payments"
        title="GridMarket Wallet"
        description="Top up, pay instantly, manage escrow, gift cards, and refunds."
        actions={<Button>Add funds</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Available balance" value="R 2,450" change="Instant spend" icon={Wallet} />
        <StatCard label="Escrow held" value="R 850" change="1 active order" trend="neutral" icon={ShieldCheck} />
        <StatCard label="Reward points" value="1,280" change="R 128 redeemable" trend="up" icon={Gift} />
      </div>
      <Tabs defaultValue="methods">
        <TabsList>
          <TabsTrigger value="methods">Payment methods</TabsTrigger>
          <TabsTrigger value="installments">Installments</TabsTrigger>
          <TabsTrigger value="promo">Promo codes</TabsTrigger>
        </TabsList>
        <TabsContent value="methods" className="space-y-3">
          {PAYMENT_METHODS.map((method) => (
            <Card key={method.id} className="border-border/60 shadow-soft">
              <CardContent className="flex items-center justify-between p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{method.label}</p>
                    <p className="text-sm text-muted-foreground capitalize">{method.type}</p>
                  </div>
                </div>
                {method.default ? <Badge>Default</Badge> : <Button variant="outline" size="sm">Set default</Button>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="installments">
          <EmptyState title="Pay in 3" description="Installment plans for eligible orders over R 2,000." />
        </TabsContent>
        <TabsContent value="promo">
          <EmptyState title="No promo codes applied" description="Add a code at checkout to save." actionLabel="Browse deals" onAction={() => undefined} />
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
        title="Payment Methods"
        description="Cards, Instant EFT, Apple Pay, Google Pay, and wallet options."
        actions={<Button>Add payment method</Button>}
      />
      <Card className="mt-8 border-border/60 shadow-soft">
        <CardHeader>
          <CardTitle className="font-display">Saved methods</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {PAYMENT_METHODS.map((method) => (
            <div key={method.id} className="flex items-center justify-between rounded-xl border p-4">
              <span>{method.label}</span>
              <Badge variant="outline">{method.type}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
