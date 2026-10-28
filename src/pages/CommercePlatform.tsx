import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  Check,
  CircleDollarSign,
  Globe2,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  WandSparkles,
  Workflow,
} from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';

const supplierProducts = [
  { id: 'sup-1', name: 'Portable solar power station', supplier: 'Karoo Energy Supply', category: 'Electronics', cost: 3299, retail: 4999, margin: 34, stock: 84, delivery: '2–4 days', local: true },
  { id: 'sup-2', name: 'Premium cotton hoodie', supplier: 'Ubuntu Apparel Works', category: 'Fashion', cost: 285, retail: 549, margin: 48, stock: 340, delivery: '3–5 days', local: true },
  { id: 'sup-3', name: 'Smart Wi-Fi security camera', supplier: 'Cape Digital Wholesale', category: 'Electronics', cost: 410, retail: 799, margin: 49, stock: 156, delivery: '2–3 days', local: true },
  { id: 'sup-4', name: 'Bamboo kitchen organiser set', supplier: 'Global Source Direct', category: 'Home', cost: 190, retail: 429, margin: 56, stock: 920, delivery: '8–14 days', local: false },
];

const features = [
  { icon: Store, title: 'Storefront SaaS', text: 'Launch branded online stores with custom domains, themes, pages, products, discounts and analytics.' },
  { icon: Boxes, title: 'Supplier marketplace', text: 'Discover verified local and international suppliers with transparent costs, stock, delivery times and margins.' },
  { icon: RefreshCw, title: 'Dropshipping automation', text: 'Sync inventory and prices, route paid orders to suppliers and bring tracking back to customers automatically.' },
  { icon: Workflow, title: 'One operations hub', text: 'Manage direct stock, supplier products, marketplace listings and every sales channel from one workspace.' },
  { icon: CircleDollarSign, title: 'South African payments', text: 'Sell in rand with Paystack-ready checkout, platform fees, refunds, seller balances and reconciliation.' },
  { icon: WandSparkles, title: 'AI commerce copilot', text: 'Generate listings, improve product content, forecast margins and surface catalogue or fulfilment risks.' },
];

const plans = [
  { name: 'Start', price: 'R199', description: 'For a new online business', items: ['Online store', 'Up to 100 products', 'Local supplier catalogue', 'Basic analytics'] },
  { name: 'Grow', price: 'R599', description: 'For scaling merchants', featured: true, items: ['Unlimited products', 'Automated dropshipping', 'Custom domain', 'Multi-channel selling', 'Advanced analytics'] },
  { name: 'Scale', price: 'R1,499', description: 'For teams and suppliers', items: ['Everything in Grow', 'Staff permissions', 'Wholesale price lists', 'API and webhooks', 'Priority support'] },
];

export function CommercePlatform() {
  const [query, setQuery] = useState('');
  const [localOnly, setLocalOnly] = useState(false);
  const [imported, setImported] = useState<string[]>([]);
  const products = useMemo(() => supplierProducts.filter((item) => {
    const matchesQuery = `${item.name} ${item.supplier} ${item.category}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (!localOnly || item.local);
  }), [localOnly, query]);

  return (
    <div className="pb-20">
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <div className="container mx-auto grid gap-12 px-4 py-20 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:py-28">
          <div>
            <Badge className="mb-5" variant="secondary">GridCommerce · Built for African commerce</Badge>
            <h1 className="max-w-4xl text-4xl font-display font-bold tracking-tight sm:text-6xl">
              Your store, suppliers and fulfilment in one commerce platform.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              Build a branded ecommerce store, source products from verified suppliers, sell through GridMarket and automate dropshipping without stitching together multiple tools.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg"><Link to="/store/create">Start your store <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              <Button asChild size="lg" variant="outline"><a href="#suppliers">Explore suppliers</a></Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {['No stock required', 'Local supplier network', 'One order dashboard'].map((item) => <span key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />{item}</span>)}
            </div>
          </div>

          <Card className="border-primary/20 shadow-soft-lg">
            <CardHeader>
              <div className="flex items-center justify-between"><CardTitle>Today’s commerce pulse</CardTitle><Badge className="bg-emerald-500/10 text-emerald-600">Live</Badge></div>
              <CardDescription>One view across your store and supplier orders</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                {[['Revenue', 'R 28,450'], ['Orders', '64'], ['Margin', '36.8%']].map(([label, value]) => <div key={label} className="rounded-xl bg-secondary/60 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-bold">{value}</p></div>)}
              </div>
              <div className="space-y-3">
                {[['New order #GS-2048', 'Route to supplier', Truck], ['Solar station stock changed', '84 available', RefreshCw], ['Payout ready', 'R 9,780', CircleDollarSign]].map(([title, meta, Icon]) => {
                  const RowIcon = Icon as typeof Truck;
                  return <div key={String(title)} className="flex items-center gap-3 rounded-xl border border-border p-3"><span className="rounded-lg bg-primary/10 p-2 text-primary"><RowIcon className="h-4 w-4" /></span><div className="flex-1"><p className="text-sm font-medium">{String(title)}</p><p className="text-xs text-muted-foreground">{String(meta)}</p></div><ArrowRight className="h-4 w-4 text-muted-foreground" /></div>;
                })}
              </div>
              <div className="rounded-xl bg-primary p-4 text-primary-foreground"><p className="text-sm font-semibold">AI recommendation</p><p className="mt-1 text-sm opacity-90">Restock your two fastest sellers and pause one low-margin supplier product.</p></div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-3xl text-center"><Badge variant="outline">Commerce operating system</Badge><h2 className="mt-4 text-3xl font-display font-bold sm:text-4xl">More capable than a store builder</h2><p className="mt-3 text-muted-foreground">GridCommerce connects selling, sourcing and operations so entrepreneurs can start lean and scale without rebuilding their stack.</p></div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => <Card key={title}><CardContent className="p-6"><span className="inline-flex rounded-xl bg-primary/10 p-3 text-primary"><Icon className="h-5 w-5" /></span><h3 className="mt-4 font-semibold text-lg">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></CardContent></Card>)}
        </div>
      </section>

      <section id="suppliers" className="border-y border-border bg-secondary/30 py-20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><Badge variant="secondary">Supplier network</Badge><h2 className="mt-3 text-3xl font-display font-bold">Find products worth selling</h2><p className="mt-2 max-w-2xl text-muted-foreground">Compare cost, margin, stock and delivery performance before importing a product into your store.</p></div><div className="flex flex-col gap-2 sm:flex-row"><Input icon={<Search className="h-4 w-4" />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search supplier products" className="sm:w-72" /><Button variant={localOnly ? 'default' : 'outline'} onClick={() => setLocalOnly((value) => !value)}><Globe2 className="mr-2 h-4 w-4" />Local only</Button></div></div>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {products.map((item) => {
              const isImported = imported.includes(item.id);
              return <Card key={item.id}><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap gap-2"><Badge variant="outline">{item.category}</Badge>{item.local && <Badge variant="secondary">South African supplier</Badge>}</div><h3 className="mt-3 text-lg font-semibold">{item.name}</h3><p className="text-sm text-muted-foreground">{item.supplier}</p></div><PackageCheck className="h-6 w-6 text-primary" /></div><div className="mt-5 grid grid-cols-4 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Cost</p><p className="font-semibold">R {item.cost.toLocaleString()}</p></div><div><p className="text-xs text-muted-foreground">Retail</p><p className="font-semibold">R {item.retail.toLocaleString()}</p></div><div><p className="text-xs text-muted-foreground">Margin</p><p className="font-semibold text-emerald-600">{item.margin}%</p></div><div><p className="text-xs text-muted-foreground">Stock</p><p className="font-semibold">{item.stock}</p></div></div><div className="mt-5 flex items-center justify-between border-t border-border pt-4"><span className="text-sm text-muted-foreground"><Truck className="mr-1 inline h-4 w-4" />{item.delivery}</span><Button size="sm" variant={isImported ? 'secondary' : 'default'} disabled={isImported} onClick={() => setImported((items) => [...items, item.id])}>{isImported ? <><Check className="mr-2 h-4 w-4" />Imported</> : 'Import to store'}</Button></div></CardContent></Card>;
            })}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-20">
        <div className="text-center"><Badge variant="outline">Simple SaaS pricing</Badge><h2 className="mt-3 text-3xl font-display font-bold">Start small. Scale on one platform.</h2><p className="mt-2 text-muted-foreground">Monthly plans in rand. Payment processing and supplier charges are separate.</p></div>
        <div className="mx-auto mt-10 grid max-w-5xl gap-5 lg:grid-cols-3">
          {plans.map((plan) => <Card key={plan.name} className={plan.featured ? 'border-primary shadow-soft-lg' : ''}><CardHeader>{plan.featured && <Badge className="mb-2 w-fit">Most popular</Badge>}<CardTitle>{plan.name}</CardTitle><CardDescription>{plan.description}</CardDescription><div className="pt-3"><span className="text-3xl font-bold">{plan.price}</span><span className="text-muted-foreground"> / month</span></div></CardHeader><CardContent><ul className="space-y-3">{plan.items.map((item) => <li key={item} className="flex gap-2 text-sm"><Check className="h-4 w-4 text-primary" />{item}</li>)}</ul><Button asChild className="mt-6 w-full" variant={plan.featured ? 'default' : 'outline'}><Link to="/signup">Choose {plan.name}</Link></Button></CardContent></Card>)}
        </div>
      </section>

      <section className="container mx-auto px-4"><div className="rounded-3xl bg-foreground px-6 py-12 text-center text-background sm:px-12"><ShieldCheck className="mx-auto h-9 w-9 text-primary" /><h2 className="mt-4 text-3xl font-display font-bold">Own your brand. Grow through the network.</h2><p className="mx-auto mt-3 max-w-2xl text-background/70">Sell from your own storefront, the GridMarket marketplace, or both—while one catalogue and operations hub stays in sync.</p><Button asChild size="lg" className="mt-7"><Link to="/store/create">Build your commerce business <ShoppingBag className="ml-2 h-4 w-4" /></Link></Button></div></section>
    </div>
  );
}
