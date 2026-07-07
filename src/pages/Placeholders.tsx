import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { useApp } from '../context/AppContext';
import {
  askAiAssistant,
  getJobs,
  getMarketplaceProducts,
  getProductById,
  getRentals,
  getServices,
  getStores,
} from '../services/mockApi';
import { apiGetListing, isPlatformApiAvailable } from '../services/platformApi';
import { apiGetAuctionDetail, apiGetAuctions } from '../services/tradeApi';
import type { AuctionBid, HaggleOffer, Job, Product, Rental, SellerListing, Service, StoreProfile } from '../types';

function Currency({ value }: { value: number }) {
  return <>{`R ${value.toLocaleString('en-ZA')}`}</>;
}

function SaleModeBadge({ listing }: { listing: Partial<SellerListing> }) {
  if (listing.saleMode === 'auction' || listing.auctionStatus === 'live') {
    return <Badge variant="secondary">Live auction</Badge>;
  }
  if (listing.haggleEnabled || listing.saleMode === 'haggle') {
    return <Badge variant="outline">Haggle</Badge>;
  }
  return null;
}

function minimumBid(listing: SellerListing) {
  const increment = listing.bidIncrement ?? 50;
  const floor = listing.startingBid ?? listing.price;
  if (!listing.currentBid || listing.currentBid <= 0) return floor;
  return listing.currentBid + increment;
}

function isAuctionLive(listing: SellerListing) {
  if (listing.saleMode !== 'auction' || listing.auctionStatus !== 'live') return false;
  if (!listing.auctionEndsAt) return true;
  return new Date(listing.auctionEndsAt).getTime() > Date.now();
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-10 text-center">
        <h3 className="text-xl font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function useQuerySearchParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const categoryParam = searchParams.get('category') ?? 'all';
  const setQuery = (nextValue: string) => {
    const nextParams: Record<string, string> = {};
    if (categoryParam !== 'all') nextParams.category = categoryParam;
    if (!nextValue.trim()) {
      setSearchParams(nextParams);
      return;
    }
    setSearchParams({ ...nextParams, q: nextValue.trim() });
  };
  const setCategoryParam = (nextCategory: string) => {
    const nextParams: Record<string, string> = {};
    if (query.trim()) nextParams.q = query.trim();
    if (nextCategory !== 'all') nextParams.category = nextCategory;
    setSearchParams(nextParams);
  };
  return { query, categoryParam, setQuery, setCategoryParam };
}

export function Marketplace() {
  const { addToCart, toggleWishlist, isInWishlist, sellerListings, reportTrustIssue } = useApp();
  const { query, categoryParam, setQuery, setCategoryParam } = useQuerySearchParam();
  const [draftQuery, setDraftQuery] = useState(query);
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('relevance');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setDraftQuery(query);
    setCategory(categoryParam);
    setPage(1);
    setLoading(true);
    getMarketplaceProducts(query, categoryParam)
      .then((catalogueItems) => {
        const liveListings = sellerListings.filter((item) => item.status === 'active');
        const merged = [...liveListings, ...catalogueItems].filter(
          (item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index
        );
        setItems(merged);
      })
      .finally(() => setLoading(false));
  }, [categoryParam, query, sellerListings]);

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(items.map((item) => item.category)))],
    [items]
  );

  const filteredItems = useMemo(() => {
    const nextItems = category === 'all' ? items : items.filter((item) => item.category === category);
    return [...nextItems].sort((a, b) => {
      if (sort === 'price-low') return a.price - b.price;
      if (sort === 'price-high') return b.price - a.price;
      if (sort === 'rating') return b.rating - a.rating;
      return Number(Boolean(b.verified)) - Number(Boolean(a.verified));
    });
  }, [category, items, sort]);

  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pageItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const onSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setQuery(draftQuery);
  };

  return (
    <div className="container mx-auto px-4 py-10 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Marketplace</h1>
          <p className="text-muted-foreground">
            Live catalogue with searchable product data and cart/wishlist actions.
          </p>
        </div>
        <form className="w-full sm:w-auto sm:min-w-[380px]" onSubmit={onSearchSubmit}>
          <Input
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="Search products, category, seller, location"
          />
        </form>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Category</span>
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setCategoryParam(event.target.value);
              setPage(1);
            }}
            className="h-10 w-full rounded-md border border-input bg-background px-3"
          >
            {categories.map((item) => (
              <option key={item} value={item}>
                {item === 'all' ? 'All categories' : item}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Sort</span>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
            className="h-10 w-full rounded-md border border-input bg-background px-3"
          >
            <option value="relevance">Verified first</option>
            <option value="rating">Highest rated</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
          </select>
        </label>
        <div className="flex items-end justify-between text-sm text-muted-foreground">
          <span>
            {filteredItems.length} results, page {page} of {pageCount}
          </span>
          <Link to="/marketplace?category=Electronics" className="text-primary hover:underline">
            Electronics category
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading products...</p>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title="No products matched your filters"
          description="Try a broader query or clear the search to see all listings."
        />
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {pageItems.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <Link to={`/product/${item.id}`} className="block h-48 bg-muted">
                <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
              </Link>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{item.category}</p>
                    <Link to={`/product/${item.id}`} className="font-semibold hover:text-primary">
                      {item.title}
                    </Link>
                  </div>
                  {item.verified ? (
                    <Badge variant="secondary">Verified</Badge>
                  ) : item.badge ? (
                    <Badge variant="secondary">{item.badge}</Badge>
                  ) : null}
                  <SaleModeBadge listing={item as SellerListing} />
                </div>
                <p className="text-sm text-muted-foreground">{item.seller}</p>
                <p className="text-sm text-muted-foreground">{item.location}</p>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">
                    <Currency value={item.price} />
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {item.rating} ({item.reviews})
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      addToCart(item.id);
                      toast.success(`${item.title} added to cart`);
                    }}
                  >
                    Add to cart
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      toggleWishlist(item.id);
                      toast.success(
                        isInWishlist(item.id)
                          ? `${item.title} removed from wishlist`
                          : `${item.title} saved to wishlist`
                      );
                    }}
                  >
                    {isInWishlist(item.id) ? 'Saved' : 'Save'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      reportTrustIssue('listing', item.id, 'Buyer requested listing review');
                      toast.success('Listing sent to trust review');
                    }}
                  >
                    Report
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={page === pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
        </>
      )}
    </div>
  );
}

export function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    user,
    addToCart,
    toggleWishlist,
    isInWishlist,
    sendMessage,
    reportTrustIssue,
    sellerListings,
    submitOffer,
    placeBid,
    loadListingOffers,
  } = useApp();
  const [product, setProduct] = useState<SellerListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<HaggleOffer[]>([]);
  const [bids, setBids] = useState<AuctionBid[]>([]);
  const [offerAmount, setOfferAmount] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [tradeBusy, setTradeBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    const load = async () => {
      let item: SellerListing | null =
        sellerListings.find((listing) => listing.id === id) ?? null;

      if (isPlatformApiAvailable()) {
        try {
          item = await apiGetListing(id);
        } catch {
          // Fall back to catalogue lookup.
        }
      }

      if (!item) {
        const catalogueItem = await getProductById(id);
        item = catalogueItem
          ? ({ ...catalogueItem, status: 'active', inventory: 1, riskScore: 10, verified: true } as SellerListing)
          : null;
      }

      setProduct(item);

      if (item?.saleMode === 'auction' && isPlatformApiAvailable()) {
        try {
          const detail = await apiGetAuctionDetail(id);
          setProduct(detail.listing);
          setBids(detail.bids);
        } catch {
          setBids([]);
        }
      } else {
        setBids([]);
      }

      if (user && item && (item.haggleEnabled || item.saleMode === 'haggle')) {
        try {
          setOffers(await loadListingOffers(id));
        } catch {
          setOffers([]);
        }
      } else {
        setOffers([]);
      }
    };

    void load().finally(() => setLoading(false));
  }, [id, sellerListings, user, loadListingOffers]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-10">
        <p className="text-muted-foreground">Loading product...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-10">
        <EmptyState
          title="Product not found"
          description="This listing does not exist anymore or may have been removed."
        />
      </div>
    );
  }

  const isAuction = product.saleMode === 'auction';
  const isHaggle = product.haggleEnabled || product.saleMode === 'haggle';
  const auctionLive = isAuction && isAuctionLive(product);
  const minBid = isAuction ? minimumBid(product) : 0;

  const handleSubmitOffer = async () => {
    if (!id) return;
    const amount = Number(offerAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid offer amount');
      return;
    }
    if (!user) {
      toast.error('Sign in to make an offer');
      navigate('/login');
      return;
    }
    setTradeBusy(true);
    try {
      const offer = await submitOffer(id, amount, offerMessage.trim() || undefined);
      setOffers((current) => [offer, ...current]);
      setOfferAmount('');
      setOfferMessage('');
      toast.success('Offer submitted to seller');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit offer');
    } finally {
      setTradeBusy(false);
    }
  };

  const handlePlaceBid = async () => {
    if (!id) return;
    const amount = Number(bidAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid bid amount');
      return;
    }
    if (!user) {
      toast.error('Sign in to place a bid');
      navigate('/login');
      return;
    }
    setTradeBusy(true);
    try {
      const result = await placeBid(id, amount);
      setProduct(result.listing);
      setBids((current) => [result.bid, ...current]);
      setBidAmount('');
      toast.success('Bid placed successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to place bid');
    } finally {
      setTradeBusy(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="rounded-xl overflow-hidden bg-muted border border-border">
          <img src={product.image} alt={product.title} className="w-full h-full object-cover" />
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{product.category}</Badge>
            <SaleModeBadge listing={product} />
          </div>
          <h1 className="text-3xl font-display font-bold">{product.title}</h1>
          <p className="text-muted-foreground">{product.description}</p>
          <p className="text-muted-foreground">
            Sold by {product.seller} • {product.location}
          </p>

          {isAuction ? (
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                {auctionLive ? 'Live auction' : 'Auction ended'}
              </p>
              <p className="text-3xl font-bold">
                <Currency value={product.currentBid && product.currentBid > 0 ? product.currentBid : minBid} />
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  {product.currentBid && product.currentBid > 0 ? 'current bid' : 'starting bid'}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                Buy now price: <Currency value={product.price} /> • {product.bidCount ?? 0} bids
              </p>
              {product.auctionEndsAt ? (
                <p className="text-sm text-muted-foreground">
                  Ends {new Date(product.auctionEndsAt).toLocaleString('en-ZA')}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-3xl font-bold">
              <Currency value={product.price} />
              {isHaggle ? (
                <span className="ml-2 text-base font-normal text-muted-foreground">open to offers</span>
              ) : null}
            </p>
          )}

          {!isAuction ? (
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  addToCart(product.id);
                  toast.success('Item added to cart');
                }}
              >
                Add to cart
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  toggleWishlist(product.id);
                  toast.success(
                    isInWishlist(product.id) ? 'Removed from wishlist' : 'Saved to wishlist'
                  );
                }}
              >
                {isInWishlist(product.id) ? 'Remove wishlist' : 'Save wishlist'}
              </Button>
            </div>
          ) : null}

          {isHaggle ? (
            <Card>
              <CardHeader>
                <CardTitle>Make an offer</CardTitle>
                <CardDescription>
                  Like Yaga — submit a price below the asking amount and the seller can accept, decline, or counter.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  type="number"
                  value={offerAmount}
                  onChange={(event) => setOfferAmount(event.target.value)}
                  placeholder={`Offer below R ${product.price.toLocaleString('en-ZA')}`}
                />
                <textarea
                  value={offerMessage}
                  onChange={(event) => setOfferMessage(event.target.value)}
                  className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Optional message to the seller"
                />
                <Button disabled={tradeBusy} onClick={() => void handleSubmitOffer()}>
                  Submit offer
                </Button>
                {offers.length ? (
                  <div className="space-y-2 pt-2">
                    <p className="text-sm font-medium">Your offers</p>
                    {offers.map((offer) => (
                      <div key={offer.id} className="rounded-md border border-border p-2 text-sm">
                        <Currency value={offer.amount} /> — {offer.status}
                        {offer.counterAmount ? (
                          <span className="text-muted-foreground">
                            {' '}
                            (counter: <Currency value={offer.counterAmount} />)
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {isAuction ? (
            <Card>
              <CardHeader>
                <CardTitle>Place a bid</CardTitle>
                <CardDescription>
                  Minimum next bid: <Currency value={minBid} />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  type="number"
                  value={bidAmount}
                  onChange={(event) => setBidAmount(event.target.value)}
                  placeholder={`Bid at least R ${minBid.toLocaleString('en-ZA')}`}
                  disabled={!auctionLive}
                />
                <Button disabled={tradeBusy || !auctionLive} onClick={() => void handlePlaceBid()}>
                  {auctionLive ? 'Place bid' : 'Auction ended'}
                </Button>
                {bids.length ? (
                  <div className="space-y-2 pt-2">
                    <p className="text-sm font-medium">Recent bids</p>
                    {bids.slice(0, 8).map((bid) => (
                      <div key={bid.id} className="flex justify-between text-sm rounded-md border border-border p-2">
                        <span>{bid.bidderName}</span>
                        <span>
                          <Currency value={bid.amount} />
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                sendMessage('thread-cameraworld', `Hi, I have a question about ${product.title}.`);
                toast.success('Message draft sent to seller thread');
                navigate('/messages');
              }}
            >
              Message seller
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                reportTrustIssue('listing', product.id, 'Product detail report');
                toast.success('Listing reported for moderation review');
              }}
            >
              Report listing
            </Button>
            {isAuction ? (
              <Button variant="outline" asChild>
                <Link to="/auctions">Browse all auctions</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Auctions() {
  const { sellerListings } = useApp();
  const [auctions, setAuctions] = useState<SellerListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const load = async () => {
      if (isPlatformApiAvailable()) {
        try {
          setAuctions(await apiGetAuctions());
          return;
        } catch {
          // Fall back to local listings.
        }
      }
      setAuctions(
        sellerListings.filter(
          (listing) => listing.saleMode === 'auction' && listing.status === 'active'
        )
      );
    };
    void load().finally(() => setLoading(false));
  }, [sellerListings]);

  const liveAuctions = auctions.filter(isAuctionLive);
  const endedAuctions = auctions.filter((listing) => !isAuctionLive(listing));

  return (
    <div className="container mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold">Live Auctions</h1>
        <p className="text-muted-foreground">
          Bid on verified listings with real-time price updates — Yaga-style haggle listings stay in the marketplace.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading auctions...</p>
      ) : liveAuctions.length === 0 && endedAuctions.length === 0 ? (
        <EmptyState
          title="No auctions yet"
          description="Sellers can enable auction mode when creating a listing from the seller dashboard."
        />
      ) : (
        <>
          {liveAuctions.length ? (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Live now ({liveAuctions.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {liveAuctions.map((item) => (
                  <Card key={item.id} className="overflow-hidden">
                    <Link to={`/product/${item.id}`} className="block h-44 bg-muted">
                      <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
                    </Link>
                    <CardContent className="p-4 space-y-2">
                      <Link to={`/product/${item.id}`} className="font-semibold hover:text-primary">
                        {item.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">{item.seller}</p>
                      <p className="text-lg font-bold">
                        <Currency
                          value={
                            item.currentBid && item.currentBid > 0
                              ? item.currentBid
                              : minimumBid(item)
                          }
                        />
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.bidCount ?? 0} bids
                        {item.auctionEndsAt
                          ? ` • ends ${new Date(item.auctionEndsAt).toLocaleString('en-ZA')}`
                          : ''}
                      </p>
                      <Button asChild className="w-full">
                        <Link to={`/product/${item.id}`}>Place bid</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {endedAuctions.length ? (
            <section className="space-y-4">
              <h2 className="text-xl font-semibold">Recently ended</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {endedAuctions.map((item) => (
                  <Card key={item.id} className="overflow-hidden opacity-80">
                    <CardContent className="p-4 space-y-2">
                      <Link to={`/product/${item.id}`} className="font-semibold hover:text-primary">
                        {item.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">Final bid</p>
                      <p className="text-lg font-bold">
                        <Currency value={item.currentBid ?? item.startingBid ?? item.price} />
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function QueryPageHeader({
  title,
  description,
  query,
  setQuery,
  placeholder,
}: {
  title: string;
  description: string;
  query: string;
  setQuery: (value: string) => void;
  placeholder: string;
}) {
  const [draftQuery, setDraftQuery] = useState(query);

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-display font-bold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <form
        className="w-full sm:w-auto sm:min-w-[360px]"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(draftQuery);
        }}
      >
        <Input
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
          placeholder={placeholder}
        />
      </form>
    </div>
  );
}

export function Services() {
  const { requestServiceBooking } = useApp();
  const { query, setQuery } = useQuerySearchParam();
  const [items, setItems] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getServices(query)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="container mx-auto px-4 py-10 space-y-6">
      <QueryPageHeader
        title="Services Marketplace"
        description="Browse service providers with searchable skills, location, and pricing."
        query={query}
        setQuery={setQuery}
        placeholder="Search services, provider, category, location"
      />
      {loading ? (
        <p className="text-muted-foreground">Loading services...</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No services found"
          description="Try another keyword, category, or location."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => (
            <Card key={item.id}>
              <div className="h-44 bg-muted rounded-t-xl overflow-hidden">
                <Link to={`/services/${item.id}`} className="block h-full">
                  <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                </Link>
              </div>
              <CardHeader>
                <CardTitle>
                  <Link to={`/services/${item.id}`} className="hover:text-primary">
                    {item.title}
                  </Link>
                </CardTitle>
                <CardDescription>{item.provider}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">{item.description}</p>
                <p className="text-sm text-muted-foreground">{item.location}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{item.category}</Badge>
                  <span className="font-semibold">{item.priceLabel}</span>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    requestServiceBooking(
                      item.id,
                      item.title,
                      item.provider,
                      `Please quote ${item.title} in ${item.location}.`
                    );
                    toast.success('Booking request sent');
                  }}
                >
                  Request booking
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function Rentals() {
  const { requestRentalReservation } = useApp();
  const { query, setQuery } = useQuerySearchParam();
  const [items, setItems] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState<Record<string, { startDate: string; endDate: string }>>({});

  useEffect(() => {
    setLoading(true);
    getRentals(query)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="container mx-auto px-4 py-10 space-y-6">
      <QueryPageHeader
        title="Rentals"
        description="Explore vehicle, equipment, and property rentals from verified providers."
        query={query}
        setQuery={setQuery}
        placeholder="Search rentals by title, owner, category, location"
      />
      {loading ? (
        <p className="text-muted-foreground">Loading rentals...</p>
      ) : items.length === 0 ? (
        <EmptyState title="No rentals found" description="Adjust your query and try again." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => (
            <Card key={item.id}>
              <div className="h-44 bg-muted rounded-t-xl overflow-hidden">
                <Link to={`/rentals/${item.id}`} className="block h-full">
                  <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                </Link>
              </div>
              <CardHeader>
                <CardTitle>
                  <Link to={`/rentals/${item.id}`} className="hover:text-primary">
                    {item.title}
                  </Link>
                </CardTitle>
                <CardDescription>{item.owner}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">{item.description}</p>
                <p className="text-sm text-muted-foreground">{item.location}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{item.category}</Badge>
                  <span className="font-semibold">
                    <Currency value={item.dailyRate} /> / day
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={dates[item.id]?.startDate ?? ''}
                    onChange={(event) =>
                      setDates((value) => ({
                        ...value,
                        [item.id]: {
                          startDate: event.target.value,
                          endDate: value[item.id]?.endDate ?? '',
                        },
                      }))
                    }
                    aria-label={`${item.title} start date`}
                  />
                  <Input
                    type="date"
                    value={dates[item.id]?.endDate ?? ''}
                    onChange={(event) =>
                      setDates((value) => ({
                        ...value,
                        [item.id]: {
                          startDate: value[item.id]?.startDate ?? '',
                          endDate: event.target.value,
                        },
                      }))
                    }
                    aria-label={`${item.title} end date`}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    const selectedDates = dates[item.id] ?? { startDate: '', endDate: '' };
                    requestRentalReservation(
                      item.id,
                      item.title,
                      selectedDates.startDate,
                      selectedDates.endDate
                    );
                    toast.success(
                      selectedDates.startDate && selectedDates.endDate
                        ? 'Rental availability requested'
                        : 'Add dates to complete availability check'
                    );
                  }}
                >
                  Check availability
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function Jobs() {
  const { submitJobApplication, user } = useApp();
  const { query, setQuery } = useQuerySearchParam();
  const [items, setItems] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getJobs(query)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="container mx-auto px-4 py-10 space-y-6">
      <QueryPageHeader
        title="Jobs"
        description="Search active roles by company, location, and job type."
        query={query}
        setQuery={setQuery}
        placeholder="Search role, company, location, job type"
      />
      {loading ? (
        <p className="text-muted-foreground">Loading jobs...</p>
      ) : items.length === 0 ? (
        <EmptyState title="No jobs found" description="Try another title or location." />
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-semibold text-lg">
                    <Link to={`/jobs/${item.id}`} className="hover:text-primary">
                      {item.title}
                    </Link>
                  </h3>
                  <p className="text-muted-foreground">
                    {item.company} • {item.location}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                </div>
                <div className="text-left md:text-right">
                  <Badge variant="outline" className="mb-2">
                    {item.type}
                  </Badge>
                  <p className="font-semibold">{item.salaryLabel}</p>
                  <Button
                    className="mt-2"
                    size="sm"
                    onClick={() => {
                      submitJobApplication(
                        item.id,
                        item.title,
                        user?.name ?? 'GridStore candidate',
                        `${item.id}-cv.pdf`
                      );
                      toast.success('Application submitted');
                    }}
                  >
                    Apply
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

export function SellerDashboard() {
  const {
    sellerListings,
    sellerStores,
    orders,
    payoutSummary,
    trustReports,
    createSellerListing,
    updateSellerListing,
    pauseSellerListing,
    generateListingDraft,
    loadIncomingOffers,
    respondToOffer,
  } = useApp();
  const [draftSeed, setDraftSeed] = useState('');
  const [incomingOffers, setIncomingOffers] = useState<HaggleOffer[]>([]);
  const [form, setForm] = useState({
    title: '',
    category: 'Electronics',
    price: 0,
    inventory: 1,
    description: '',
    location: 'Cape Town',
    saleMode: 'fixed' as 'fixed' | 'haggle' | 'auction',
    haggleEnabled: false,
    startingBid: 0,
    bidIncrement: 50,
    reservePrice: 0,
    auctionDurationHours: 72,
  });

  useEffect(() => {
    void loadIncomingOffers().then(setIncomingOffers).catch(() => setIncomingOffers([]));
  }, [loadIncomingOffers, sellerListings]);

  const sellerOrders = orders.filter((order) =>
    order.lines.some((line) => sellerListings.some((listing) => listing.id === line.productId))
  );

  const submitListing = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) {
      toast.error('Listing title is required');
      return;
    }
    await createSellerListing({
      ...form,
      haggleEnabled: form.saleMode === 'haggle' ? true : form.haggleEnabled,
      startingBid: form.saleMode === 'auction' ? form.startingBid || form.price : undefined,
      reservePrice: form.saleMode === 'auction' && form.reservePrice > 0 ? form.reservePrice : undefined,
    });
    setForm({
      title: '',
      category: 'Electronics',
      price: 0,
      inventory: 1,
      description: '',
      location: 'Cape Town',
      saleMode: 'fixed',
      haggleEnabled: false,
      startingBid: 0,
      bidIncrement: 50,
      reservePrice: 0,
      auctionDurationHours: 72,
    });
    toast.success('Draft listing created');
  };

  return (
    <div className="container mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Seller Dashboard</h1>
        <p className="text-muted-foreground">
          Listing operations, inventory, orders, payouts, and trust review.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Active listings</CardTitle>
            <CardDescription>Published inventory visible in marketplace</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {sellerListings.filter((item) => item.status === 'active').length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Seller orders</CardTitle>
            <CardDescription>Orders containing your listings</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{sellerOrders.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Available payout</CardTitle>
            <CardDescription>Provider-ready payout summary</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              R {Math.round(payoutSummary.available).toLocaleString('en-ZA')}
            </p>
            <p className="text-sm text-muted-foreground">
              Pending R {Math.round(payoutSummary.pending).toLocaleString('en-ZA')} - next {payoutSummary.nextPayoutDate}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>My storefronts</CardTitle>
            <CardDescription>Business profiles linked to your seller account.</CardDescription>
          </div>
          <Button asChild size="sm">
            <Link to="/store/create">Create storefront</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {sellerStores.length ? (
            sellerStores.map((store) => (
              <div
                key={store.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <Link to={`/store/${store.id}`} className="font-medium hover:text-primary">
                    {store.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {store.category} • {store.location}
                  </p>
                </div>
                <Badge variant={store.status === 'active' ? 'secondary' : 'outline'}>
                  {store.status ?? 'active'}
                </Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No storefront yet.{' '}
              <Link to="/store/create" className="text-primary hover:underline">
                Create one
              </Link>{' '}
              before publishing listings.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>AI listing draft</CardTitle>
            <CardDescription>Generate a draft, then review before publishing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={draftSeed}
              onChange={(event) => setDraftSeed(event.target.value)}
              placeholder="e.g. premium solar inverter"
            />
            <Button
              className="w-full"
              onClick={() => {
                setForm(generateListingDraft(draftSeed));
                toast.success('AI draft prepared');
              }}
            >
              Generate draft
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Create listing</CardTitle>
            <CardDescription>Local CRUD flow shaped for a backend listing API.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={submitListing}>
              <Input
                value={form.title}
                onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
                placeholder="Listing title"
              />
              <Input
                value={form.category}
                onChange={(event) => setForm((value) => ({ ...value, category: event.target.value }))}
                placeholder="Category"
              />
              <Input
                type="number"
                value={form.price}
                onChange={(event) =>
                  setForm((value) => ({ ...value, price: Number(event.target.value) }))
                }
                placeholder="Price"
              />
              <Input
                type="number"
                value={form.inventory}
                onChange={(event) =>
                  setForm((value) => ({ ...value, inventory: Number(event.target.value) }))
                }
                placeholder="Inventory"
              />
              <Input
                value={form.location}
                onChange={(event) => setForm((value) => ({ ...value, location: event.target.value }))}
                placeholder="Location"
              />
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-muted-foreground">Sale mode</span>
                <select
                  value={form.saleMode}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      saleMode: event.target.value as 'fixed' | 'haggle' | 'auction',
                      haggleEnabled: event.target.value === 'haggle',
                    }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                >
                  <option value="fixed">Fixed price (Buy now)</option>
                  <option value="haggle">Haggle (buyers make offers)</option>
                  <option value="auction">Online auction</option>
                </select>
              </label>
              {form.saleMode === 'haggle' ? (
                <p className="md:col-span-2 text-sm text-muted-foreground">
                  Buyers can submit offers below your asking price. You accept, decline, or counter — like Yaga.
                </p>
              ) : null}
              {form.saleMode === 'auction' ? (
                <>
                  <Input
                    type="number"
                    value={form.startingBid}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, startingBid: Number(event.target.value) }))
                    }
                    placeholder="Starting bid"
                  />
                  <Input
                    type="number"
                    value={form.bidIncrement}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, bidIncrement: Number(event.target.value) }))
                    }
                    placeholder="Bid increment"
                  />
                  <Input
                    type="number"
                    value={form.reservePrice}
                    onChange={(event) =>
                      setForm((value) => ({ ...value, reservePrice: Number(event.target.value) }))
                    }
                    placeholder="Reserve price (optional)"
                  />
                  <Input
                    type="number"
                    value={form.auctionDurationHours}
                    onChange={(event) =>
                      setForm((value) => ({
                        ...value,
                        auctionDurationHours: Number(event.target.value),
                      }))
                    }
                    placeholder="Duration (hours)"
                  />
                </>
              ) : null}
              <Button type="submit">Create draft</Button>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((value) => ({ ...value, description: event.target.value }))
                }
                className="md:col-span-2 min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Description, warranty, delivery, proof of ownership"
              />
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
          <CardDescription>Update stock, pause listings, and watch risk signals.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sellerListings.map((listing) => (
            <div
              key={listing.id}
              className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_110px_110px_180px]"
            >
              <div>
                <p className="font-medium">{listing.title}</p>
                <p className="text-sm text-muted-foreground">
                  {listing.category} - R {listing.price.toLocaleString('en-ZA')} - risk {listing.riskScore}
                </p>
                <SaleModeBadge listing={listing} />
              </div>
              <Badge variant={listing.status === 'active' ? 'secondary' : 'outline'}>
                {listing.status}
              </Badge>
              <Input
                type="number"
                value={listing.inventory}
                onChange={(event) => {
                  void updateSellerListing(listing.id, { inventory: Number(event.target.value) });
                }}
                aria-label={`${listing.title} inventory`}
              />
              <Button variant="outline" onClick={() => void pauseSellerListing(listing.id)}>
                {listing.status === 'paused' ? 'Resume' : 'Pause'}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Incoming haggle offers</CardTitle>
          <CardDescription>Review buyer offers and accept, decline, or counter.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {incomingOffers.length ? (
            incomingOffers.map((offer) => (
              <div key={offer.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {offer.listingTitle} — {offer.buyerName}
                  </p>
                  <Badge variant="outline">{offer.status}</Badge>
                </div>
                <p className="text-sm">
                  Offer: <Currency value={offer.amount} />
                  {offer.message ? (
                    <span className="text-muted-foreground"> — {offer.message}</span>
                  ) : null}
                </p>
                {offer.status === 'pending' ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        void respondToOffer(offer.id, 'accept')
                          .then(() => loadIncomingOffers().then(setIncomingOffers))
                          .then(() => toast.success('Offer accepted'))
                          .catch((error) =>
                            toast.error(error instanceof Error ? error.message : 'Unable to accept')
                          );
                      }}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void respondToOffer(offer.id, 'decline')
                          .then(() => loadIncomingOffers().then(setIncomingOffers))
                          .then(() => toast.success('Offer declined'))
                          .catch((error) =>
                            toast.error(error instanceof Error ? error.message : 'Unable to decline')
                          );
                      }}
                    >
                      Decline
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No incoming offers yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trust and disputes</CardTitle>
          <CardDescription>Open marketplace reports requiring review.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {trustReports.length ? (
            trustReports.map((report) => (
              <div key={report.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {report.targetType} - {report.targetId}
                  </p>
                  <Badge variant="outline">{report.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{report.reason}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No open trust reports.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function BuyerDashboard() {
  const {
    user,
    cartCount,
    wishlistIds,
    unreadNotifications,
    orders,
    bookingRequests,
    rentalReservations,
    jobApplications,
    trustReports,
  } = useApp();

  return (
    <div className="container mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">
          {user ? `${user.name}'s dashboard` : 'Your dashboard'}
        </h1>
        <p className="text-muted-foreground">
          Track your shopping and communication activity in one place.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Cart items</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{cartCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Wishlist items</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{wishlistIds.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Unread notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{unreadNotifications}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Orders and receipts</CardTitle>
            <CardDescription>Checkout and refund lifecycle</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {orders.slice(0, 3).map((order) => (
              <div key={order.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="font-medium">{order.receiptNumber}</p>
                  <p className="text-sm text-muted-foreground">{order.status.replace('_', ' ')}</p>
                </div>
                <span className="font-semibold">R {order.total.toLocaleString('en-ZA')}</span>
              </div>
            ))}
            {!orders.length ? <p className="text-sm text-muted-foreground">No orders yet.</p> : null}
            <Button asChild variant="outline" className="w-full">
              <Link to="/orders">View order history</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requests</CardTitle>
            <CardDescription>Bookings, rentals, jobs, and safety cases</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border p-3">
              <p className="text-muted-foreground">Bookings</p>
              <p className="text-2xl font-bold">{bookingRequests.length}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-muted-foreground">Rentals</p>
              <p className="text-2xl font-bold">{rentalReservations.length}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-muted-foreground">Applications</p>
              <p className="text-2xl font-bold">{jobApplications.length}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-muted-foreground">Reports</p>
              <p className="text-2xl font-bold">{trustReports.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function Storefront() {
  const { reportTrustIssue } = useApp();
  const { query, setQuery } = useQuerySearchParam();
  const [items, setItems] = useState<StoreProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getStores(query)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="container mx-auto px-4 py-10 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Business Storefronts</h1>
          <p className="text-muted-foreground">
            Discover and compare verified business profiles.
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
        }}
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search stores, category, location"
        />
      </form>
      {loading ? (
        <p className="text-muted-foreground">Loading stores...</p>
      ) : items.length === 0 ? (
        <EmptyState title="No stores found" description="Try another search term." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              {item.image ? (
                <Link to={`/store/${item.id}`} className="block h-40 bg-muted">
                  <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                </Link>
              ) : null}
              <CardHeader>
                <CardTitle>
                  <Link to={`/store/${item.id}`} className="hover:text-primary">
                    {item.name}
                  </Link>
                </CardTitle>
                <CardDescription>{item.location}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{item.category}</Badge>
                  {item.verified ? <Badge variant="secondary">Verified</Badge> : null}
                </div>
                <p className="text-sm text-muted-foreground">{item.description}</p>
                <div className="flex items-center justify-between text-sm">
                  <span>Rating: {item.rating}</span>
                  <span>{item.followers.toLocaleString('en-ZA')} followers</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => toast.success(`${item.name} followed`)}
                  >
                    Follow
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

export function Messages() {
  const { messageThreads, sendMessage } = useApp();
  const [activeThreadId, setActiveThreadId] = useState(messageThreads[0]?.id ?? '');
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!activeThreadId && messageThreads[0]) {
      setActiveThreadId(messageThreads[0].id);
    }
  }, [activeThreadId, messageThreads]);

  const activeThread = useMemo(
    () => messageThreads.find((thread) => thread.id === activeThreadId),
    [activeThreadId, messageThreads]
  );

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="text-3xl font-display font-bold mb-6">Messages</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Conversations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {messageThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => setActiveThreadId(thread.id)}
                className={`w-full text-left p-3 rounded-lg border ${
                  thread.id === activeThreadId ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <p className="font-medium">{thread.title}</p>
                <p className="text-xs text-muted-foreground">{thread.participant}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{activeThread?.title ?? 'Select a conversation'}</CardTitle>
            <CardDescription>{activeThread?.participant ?? 'No participant'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="min-h-[260px] space-y-3">
              {activeThread?.messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    message.author === 'buyer'
                      ? 'ml-auto bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground'
                  }`}
                >
                  <p>{message.text}</p>
                  <p className="text-[10px] opacity-80 mt-1">{message.createdAt}</p>
                </div>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!activeThread) return;
                sendMessage(activeThread.id, draft, 'buyer');
                setDraft('');
              }}
            >
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type your message"
              />
              <Button type="submit">Send</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function AiAssistantAction({
  prompt,
  onResolved,
}: {
  prompt: string;
  onResolved?: (response: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="outline"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const response = await askAiAssistant(prompt);
          onResolved?.(response);
          toast('AI Assistant', { description: response });
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? 'Thinking...' : 'Ask AI'}
    </Button>
  );
}
