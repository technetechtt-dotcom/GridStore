import React from 'react';
import { toast } from 'sonner';
import { PageHeader } from '../../components/design-system/PageHeader';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  apiGetAdminAuctions,
  apiGetAdminJobs,
  apiGetAdminMarketplaceProducts,
  apiGetAdminRentals,
  apiGetAdminServices,
  apiUpdateAdminAuction,
  apiUpdateAdminJob,
  apiUpdateAdminMarketplaceProduct,
  apiUpdateAdminRental,
  apiUpdateAdminService,
  type AdminAuctionRow,
} from '../../services/adminApi';
import type { Job, Product, Rental, Service } from '../../types';
import { OpsError, OpsLoading, statusBadgeVariant, useAdminResource } from './AdminPages';

type CatalogStatus = 'active' | 'paused' | 'flagged';

function CatalogStatusBadge({ status }: { status?: CatalogStatus }) {
  return (
    <Badge variant={statusBadgeVariant(status ?? 'active')}>{status ?? 'active'}</Badge>
  );
}

function CatalogActions({
  status,
  onSetStatus,
}: {
  status?: CatalogStatus;
  onSetStatus: (next: CatalogStatus) => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button size="sm" variant="outline" onClick={() => onSetStatus('active')}>
        Activate
      </Button>
      <Button size="sm" variant="outline" onClick={() => onSetStatus('paused')}>
        Pause
      </Button>
      <Button size="sm" variant="destructive" onClick={() => onSetStatus('flagged')}>
        Flag
      </Button>
      {status && status !== 'active' ? (
        <span className="self-center text-xs text-muted-foreground">Current: {status}</span>
      ) : null}
    </div>
  );
}

export function AdminMarketplace() {
  const { data, loading, error, refresh } = useAdminResource(apiGetAdminMarketplaceProducts);

  const setStatus = async (product: Product, status: CatalogStatus) => {
    try {
      await apiUpdateAdminMarketplaceProduct(product.id, { status });
      toast.success(`${product.title} marked ${status}`);
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
        title="Marketplace"
        description="Manage catalogue products shown on the public marketplace."
      />
      <Card className="border-border/60 shadow-soft">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.title}</TableCell>
                  <TableCell>{product.seller}</TableCell>
                  <TableCell>{product.category}</TableCell>
                  <TableCell>R {product.price.toLocaleString('en-ZA')}</TableCell>
                  <TableCell>
                    <CatalogStatusBadge status={product.status as CatalogStatus | undefined} />
                  </TableCell>
                  <TableCell>
                    <CatalogActions
                      status={product.status as CatalogStatus | undefined}
                      onSetStatus={(status) => void setStatus(product, status)}
                    />
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

export function AdminServices() {
  const { data, loading, error, refresh } = useAdminResource(apiGetAdminServices);

  const setStatus = async (service: Service, status: CatalogStatus) => {
    try {
      await apiUpdateAdminService(service.id, { status });
      toast.success(`${service.title} marked ${status}`);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  };

  if (loading) return <OpsLoading />;
  if (error) return <OpsError message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Services" description="Manage service providers and offerings." />
      <Card className="border-border/60 shadow-soft">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="font-medium">{service.title}</TableCell>
                  <TableCell>{service.provider}</TableCell>
                  <TableCell>{service.category}</TableCell>
                  <TableCell>{service.priceLabel}</TableCell>
                  <TableCell>
                    <CatalogStatusBadge status={service.status as CatalogStatus | undefined} />
                  </TableCell>
                  <TableCell>
                    <CatalogActions
                      status={service.status as CatalogStatus | undefined}
                      onSetStatus={(status) => void setStatus(service, status)}
                    />
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

export function AdminRentals() {
  const { data, loading, error, refresh } = useAdminResource(apiGetAdminRentals);

  const setStatus = async (rental: Rental, status: CatalogStatus) => {
    try {
      await apiUpdateAdminRental(rental.id, { status });
      toast.success(`${rental.title} marked ${status}`);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  };

  if (loading) return <OpsLoading />;
  if (error) return <OpsError message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Rentals" description="Manage rental inventory and availability." />
      <Card className="border-border/60 shadow-soft">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Daily rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((rental) => (
                <TableRow key={rental.id}>
                  <TableCell className="font-medium">{rental.title}</TableCell>
                  <TableCell>{rental.owner}</TableCell>
                  <TableCell>{rental.category}</TableCell>
                  <TableCell>R {rental.dailyRate.toLocaleString('en-ZA')}</TableCell>
                  <TableCell>
                    <CatalogStatusBadge status={rental.status as CatalogStatus | undefined} />
                  </TableCell>
                  <TableCell>
                    <CatalogActions
                      status={rental.status as CatalogStatus | undefined}
                      onSetStatus={(status) => void setStatus(rental, status)}
                    />
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

export function AdminJobs() {
  const { data, loading, error, refresh } = useAdminResource(apiGetAdminJobs);

  const setStatus = async (job: Job, status: CatalogStatus) => {
    try {
      await apiUpdateAdminJob(job.id, { status });
      toast.success(`${job.title} marked ${status}`);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  };

  if (loading) return <OpsLoading />;
  if (error) return <OpsError message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Jobs" description="Manage job postings and employer listings." />
      <Card className="border-border/60 shadow-soft">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.title}</TableCell>
                  <TableCell>{job.company}</TableCell>
                  <TableCell>{job.location}</TableCell>
                  <TableCell>{job.type}</TableCell>
                  <TableCell>
                    <CatalogStatusBadge status={job.status as CatalogStatus | undefined} />
                  </TableCell>
                  <TableCell>
                    <CatalogActions
                      status={job.status as CatalogStatus | undefined}
                      onSetStatus={(status) => void setStatus(job, status)}
                    />
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

export function AdminAuctions() {
  const { data, loading, error, refresh } = useAdminResource(apiGetAdminAuctions);

  const updateAuction = async (
    auction: AdminAuctionRow,
    patch: { status?: AdminAuctionRow['status']; auctionStatus?: AdminAuctionRow['auctionStatus'] }
  ) => {
    try {
      await apiUpdateAdminAuction(auction.id, patch);
      toast.success(`${auction.title} updated`);
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
        title="Auctions"
        description="Moderate live auctions, end listings, and pause risky bids."
      />
      <Card className="border-border/60 shadow-soft">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Listing</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Current bid</TableHead>
                <TableHead>Bids</TableHead>
                <TableHead>Auction</TableHead>
                <TableHead>Listing status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((auction) => (
                <TableRow key={auction.id}>
                  <TableCell className="font-medium">{auction.title}</TableCell>
                  <TableCell>{auction.sellerName}</TableCell>
                  <TableCell>
                    R {(auction.currentBid ?? auction.startingBid ?? auction.price).toLocaleString('en-ZA')}
                  </TableCell>
                  <TableCell>{auction.bidCount}</TableCell>
                  <TableCell>
                    <Badge variant={auction.isLive ? 'default' : 'secondary'}>
                      {auction.auctionStatus}
                      {auction.isLive ? ' · live' : ''}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(auction.status)}>{auction.status}</Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void updateAuction(auction, { auctionStatus: 'live', status: 'active' })}
                    >
                      Go live
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void updateAuction(auction, { auctionStatus: 'ended' })}
                    >
                      End
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void updateAuction(auction, { status: 'paused' })}
                    >
                      Pause
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void updateAuction(auction, { status: 'flagged' })}
                    >
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
