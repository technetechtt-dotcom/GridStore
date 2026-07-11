import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MapPin, Star, Store as StoreIcon, Clock, ShieldCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { products } from '../data/catalog';
import { useApp } from '../context/AppContext';
import { getMarketplaceProducts, getStores, getStoreById } from '../services/mockApi';
import type { Product, StoreProfile } from '../types';

type StoreTab = 'listings' | 'about' | 'policy' | 'ratings' | 'sold';
type SortOption = 'relevance' | 'price-low' | 'price-high' | 'rating' | 'newest';

const HANDLING_OPTIONS = ['all', 'Same day', '1-2 days', '3-5 days', '1 week+'] as const;

function Currency({ value }: { value: number }) {
  return <>{`R ${value.toLocaleString('en-ZA')}`}</>;
}

function EmptyBlock({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-10 text-center">
        <h3 className="mb-2 text-xl font-semibold">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function storeMatchesCategory(store: StoreProfile, category: string) {
  if (category === 'all') return true;
  if (store.category === category) return true;
  return Boolean(store.categories?.includes(category));
}

function listingsForStore(store: StoreProfile, catalogue: Product[], sellerListings: Product[]) {
  const bySeller = [...sellerListings, ...catalogue].filter(
    (item) => item.seller.toLowerCase() === store.name.toLowerCase()
  );
  return bySeller.filter(
    (item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index
  );
}

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
      <span className="font-medium">{rating.toFixed(1)}</span>
    </span>
  );
}

/** Directory of all stores with category browsing. */
export function StoresDirectory() {
  const { reportTrustIssue, sellerStores } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const categoryParam = searchParams.get('category') ?? 'all';
  const [draftQuery, setDraftQuery] = useState(query);
  const [items, setItems] = useState<StoreProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDraftQuery(query);
    setLoading(true);
    getStores(query)
      .then((rows) => {
        const merged = [...sellerStores, ...rows].filter(
          (store, index, list) => list.findIndex((candidate) => candidate.id === store.id) === index
        );
        setItems(merged);
      })
      .finally(() => setLoading(false));
  }, [query, sellerStores]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((store) => {
      set.add(store.category);
      store.categories?.forEach((entry) => set.add(entry));
    });
    return ['all', ...Array.from(set).sort()];
  }, [items]);

  const filtered = useMemo(
    () => items.filter((store) => storeMatchesCategory(store, categoryParam)),
    [categoryParam, items]
  );

  const setCategory = (next: string) => {
    const params: Record<string, string> = {};
    if (query.trim()) params.q = query.trim();
    if (next !== 'all') params.category = next;
    setSearchParams(params);
  };

  return (
    <div className="container mx-auto space-y-8 px-4 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Stores</h1>
          <p className="text-muted-foreground">
            Browse verified storefronts by category — listings, policies, and ratings in one place.
          </p>
        </div>
        <Button asChild>
          <Link to="/store/create">Create storefront</Link>
        </Button>
      </div>

      <form
        className="max-w-xl"
        onSubmit={(event) => {
          event.preventDefault();
          const params: Record<string, string> = {};
          if (draftQuery.trim()) params.q = draftQuery.trim();
          if (categoryParam !== 'all') params.category = categoryParam;
          setSearchParams(params);
        }}
      >
        <Input
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
          placeholder="Search stores, category, location"
        />
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Shop by category</h2>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <Button
              key={category}
              size="sm"
              variant={categoryParam === category ? 'default' : 'outline'}
              onClick={() => setCategory(category)}
            >
              {category === 'all' ? 'All stores' : category}
            </Button>
          ))}
        </div>
      </section>

      {loading ? (
        <p className="text-muted-foreground">Loading stores...</p>
      ) : filtered.length === 0 ? (
        <EmptyBlock title="No stores found" description="Try another search or category." />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <Link to={`/store/${item.id}`} className="block h-40 bg-muted">
                <img
                  src={
                    item.image ??
                    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=800'
                  }
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              </Link>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle>
                    <Link to={`/store/${item.id}`} className="hover:text-primary">
                      {item.name}
                    </Link>
                  </CardTitle>
                  <StarRow rating={item.rating} />
                </div>
                <CardDescription className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {item.location}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{item.category}</Badge>
                  {item.verified ? <Badge variant="secondary">Verified</Badge> : null}
                  {item.handlingTime ? (
                    <Badge variant="outline">{item.handlingTime}</Badge>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                <p className="text-sm text-muted-foreground">
                  {item.followers.toLocaleString('en-ZA')} followers
                  {item.reviewCount ? ` · ${item.reviewCount.toLocaleString('en-ZA')} ratings` : ''}
                </p>
                <div className="flex gap-2">
                  <Button className="flex-1" asChild>
                    <Link to={`/store/${item.id}`}>Visit store</Link>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      reportTrustIssue('user', item.id, 'Storefront verification review requested');
                      toast.success('Store sent to verification review');
                    }}
                  >
                    Verify
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** BoBshop-style store page with listings, about, policy, ratings, sold, and refine filters. */
export function StoreDetail() {
  const { id } = useParams();
  const { addToCart, sellerListings, toggleWishlist, isInWishlist } = useApp();
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [catalogue, setCatalogue] = useState<Product[]>(products);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<StoreTab>('listings');
  const [sort, setSort] = useState<SortOption>('relevance');
  const [category, setCategory] = useState('all');
  const [handlingTime, setHandlingTime] = useState<(typeof HANDLING_OPTIONS)[number]>('all');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([getStoreById(id), getMarketplaceProducts()])
      .then(([nextStore, nextProducts]) => {
        setStore(nextStore);
        setCatalogue(nextProducts);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const listings = useMemo(() => {
    if (!store) return [];
    return listingsForStore(store, catalogue, sellerListings);
  }, [catalogue, sellerListings, store]);

  const shopCategories = useMemo(() => {
    const fromStore = store?.categories ?? [];
    const fromListings = listings.map((item) => item.category);
    return ['all', ...Array.from(new Set([...fromStore, ...fromListings]))];
  }, [listings, store]);

  const refinedListings = useMemo(() => {
    let rows = [...listings];
    if (category !== 'all') {
      rows = rows.filter((item) => item.category === category);
    }
    if (handlingTime !== 'all' && store?.handlingTime && store.handlingTime !== handlingTime) {
      rows = [];
    }
    rows.sort((a, b) => {
      if (sort === 'price-low') return a.price - b.price;
      if (sort === 'price-high') return b.price - a.price;
      if (sort === 'rating') return b.rating - a.rating;
      if (sort === 'newest') return b.id.localeCompare(a.id);
      return Number(Boolean(b.verified ?? b.badge)) - Number(Boolean(a.verified ?? a.badge));
    });
    return rows;
  }, [category, handlingTime, listings, sort, store]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-10">
        <p className="text-muted-foreground">Loading store...</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="container mx-auto space-y-4 px-4 py-10">
        <EmptyBlock title="Store not found" description="This storefront does not exist or was removed." />
        <Button asChild variant="outline">
          <Link to="/store">Browse all stores</Link>
        </Button>
      </div>
    );
  }

  const tabs: { id: StoreTab; label: string }[] = [
    { id: 'listings', label: 'Store listings' },
    { id: 'about', label: 'About' },
    { id: 'policy', label: 'Policy' },
    { id: 'ratings', label: 'Ratings' },
    { id: 'sold', label: 'Recently sold' },
  ];

  return (
    <div className="pb-16">
      <div className="relative h-48 overflow-hidden bg-muted md:h-64">
        <img
          src={
            store.bannerImage ??
            store.image ??
            'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=1400'
          }
          alt=""
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      </div>

      <div className="container mx-auto -mt-16 space-y-6 px-4">
        <Card>
          <CardContent className="flex flex-col gap-5 p-5 md:flex-row md:items-end md:justify-between">
            <div className="flex gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-muted">
                {store.image ? (
                  <img src={store.image} alt={store.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <StoreIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl font-bold md:text-3xl">{store.name}</h1>
                  {store.verified ? <Badge variant="secondary">Verified</Badge> : null}
                </div>
                <p className="max-w-2xl text-sm text-muted-foreground">{store.description}</p>
                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {store.location}
                  </span>
                  <StarRow rating={store.rating} />
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {store.followers.toLocaleString('en-ZA')} followers
                  </span>
                  {store.handlingTime ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Ships in {store.handlingTime}
                    </span>
                  ) : null}
                  {store.memberSince ? (
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Member since {store.memberSince}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => toast.success(`Following ${store.name}`)}
              >
                Follow store
              </Button>
              <Button variant="outline" asChild>
                <Link to="/store">All stores</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2 overflow-x-auto border-b pb-px">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
                tab === entry.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {entry.label}
              {entry.id === 'listings' ? ` (${listings.length})` : ''}
              {entry.id === 'ratings' && store.reviewCount ? ` (${store.reviewCount})` : ''}
            </button>
          ))}
        </div>

        {tab === 'listings' ? (
          <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
            <aside className="space-y-5">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Shop by category
                </h2>
                <div className="flex flex-col gap-1">
                  {shopCategories.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      onClick={() => setCategory(entry)}
                      className={`rounded-md px-3 py-2 text-left text-sm ${
                        category === entry
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      {entry === 'all' ? 'All categories' : entry}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-xl border p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Refine
                </h2>
                <label className="block space-y-1 text-sm">
                  <span className="text-muted-foreground">Sort by</span>
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortOption)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3"
                  >
                    <option value="relevance">Best match</option>
                    <option value="price-low">Price: low to high</option>
                    <option value="price-high">Price: high to low</option>
                    <option value="rating">Highest rated</option>
                    <option value="newest">Newest</option>
                  </select>
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-muted-foreground">Categories</span>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3"
                  >
                    {shopCategories.map((entry) => (
                      <option key={entry} value={entry}>
                        {entry === 'all' ? 'All categories' : entry}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-muted-foreground">Handling time</span>
                  <select
                    value={handlingTime}
                    onChange={(event) =>
                      setHandlingTime(event.target.value as (typeof HANDLING_OPTIONS)[number])
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3"
                  >
                    {HANDLING_OPTIONS.map((entry) => (
                      <option key={entry} value={entry}>
                        {entry === 'all' ? 'Any handling time' : entry}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </aside>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {refinedListings.length} listing{refinedListings.length === 1 ? '' : 's'}
                {category !== 'all' ? ` in ${category}` : ''}
              </p>
              {refinedListings.length === 0 ? (
                <EmptyBlock
                  title="No listings match your filters"
                  description="Clear category or handling time filters to see more from this store."
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {refinedListings.map((item) => (
                    <Card key={item.id} className="overflow-hidden">
                      <Link to={`/product/${item.id}`} className="block h-44 bg-muted">
                        <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
                      </Link>
                      <CardContent className="space-y-2 p-4">
                        <p className="text-xs text-muted-foreground">{item.category}</p>
                        <Link to={`/product/${item.id}`} className="font-semibold hover:text-primary">
                          {item.title}
                        </Link>
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-bold">
                            <Currency value={item.price} />
                          </span>
                          <StarRow rating={item.rating} />
                        </div>
                        {store.handlingTime ? (
                          <p className="text-xs text-muted-foreground">
                            Handling: {store.handlingTime}
                          </p>
                        ) : null}
                        <div className="flex gap-2 pt-1">
                          <Button
                            className="flex-1"
                            onClick={() => {
                              addToCart(item.id);
                              toast.success('Added to cart');
                            }}
                          >
                            Add to cart
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => toggleWishlist(item.id)}
                          >
                            {isInWishlist(item.id) ? 'Saved' : 'Save'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {tab === 'about' ? (
          <Card>
            <CardHeader>
              <CardTitle>About {store.name}</CardTitle>
              <CardDescription>
                {store.responseTime ? `Response time: ${store.responseTime}` : store.category}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>{store.about ?? store.description}</p>
              {store.supportEmail ? (
                <p>
                  Contact:{' '}
                  <a className="text-primary hover:underline" href={`mailto:${store.supportEmail}`}>
                    {store.supportEmail}
                  </a>
                </p>
              ) : null}
              {store.categories?.length ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  {store.categories.map((entry) => (
                    <Badge key={entry} variant="outline">
                      {entry}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {tab === 'policy' ? (
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                ['Returns', store.policy?.returns],
                ['Shipping', store.policy?.shipping],
                ['Payment', store.policy?.payment],
                ['Warranty', store.policy?.warranty],
              ] as const
            ).map(([title, body]) =>
              body ? (
                <Card key={title}>
                  <CardHeader>
                    <CardTitle className="text-lg">{title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </CardContent>
                </Card>
              ) : null
            )}
            {!store.policy ? (
              <EmptyBlock
                title="Policies coming soon"
                description="This store has not published return, shipping, or payment policies yet."
              />
            ) : null}
          </div>
        ) : null}

        {tab === 'ratings' ? (
          <div className="space-y-4">
            <Card>
              <CardContent className="flex flex-wrap items-center gap-6 p-5">
                <div>
                  <p className="font-display text-4xl font-bold">{store.rating.toFixed(1)}</p>
                  <StarRow rating={store.rating} />
                </div>
                <p className="text-sm text-muted-foreground">
                  Based on {(store.reviewCount ?? store.reviews?.length ?? 0).toLocaleString('en-ZA')}{' '}
                  buyer ratings
                </p>
              </CardContent>
            </Card>
            {store.reviews?.length ? (
              <div className="space-y-3">
                {store.reviews.map((review) => (
                  <Card key={review.id}>
                    <CardContent className="space-y-2 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">{review.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {review.author}
                            {review.listingTitle ? ` · ${review.listingTitle}` : ''}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <StarRow rating={review.rating} />
                          <p className="text-muted-foreground">{review.createdAt}</p>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{review.comment}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyBlock title="No ratings yet" description="Be the first buyer to rate this store." />
            )}
          </div>
        ) : null}

        {tab === 'sold' ? (
          store.recentlySold?.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {store.recentlySold.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  <div className="h-40 bg-muted">
                    <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
                  </div>
                  <CardContent className="space-y-1 p-4">
                    <Badge variant="outline">{item.category}</Badge>
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-lg font-bold">
                      <Currency value={item.price} />
                    </p>
                    <p className="text-xs text-muted-foreground">Sold {item.soldAt}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyBlock
              title="No recent sales shown"
              description="Sold items from this store will appear here."
            />
          )
        ) : null}
      </div>
    </div>
  );
}
