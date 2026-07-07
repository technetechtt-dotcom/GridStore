import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { jobs, products } from '../data/catalog';
import { useApp } from '../context/AppContext';
import {
  getJobById,
  getRentalById,
  getServiceById,
  getStoreById,
} from '../services/mockApi';
import type { Job, Rental, Service, StoreProfile } from '../types';

function PageShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="container mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function MetricCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{detail}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function DetailNotFound({ label }: { label: string }) {
  return (
    <PageShell title={`${label} not found`} description="This item does not exist or may have been removed.">
      <Card className="border-dashed">
        <CardContent className="p-8 text-center space-y-4">
          <p className="text-muted-foreground">Check the URL or browse available listings.</p>
          <Button asChild>
            <Link to="/">Back to Home</Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export function FlashSales() {
  const { addToCart } = useApp();
  const saleItems = products.slice(0, 4);

  return (
    <PageShell
      title="Flash Sales"
      description="Time-boxed marketplace deals with quick cart actions."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {saleItems.map((item, index) => (
          <Card key={item.id} className="overflow-hidden">
            <Link to={`/product/${item.id}`} className="block h-40 bg-muted">
              <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
            </Link>
            <CardContent className="p-4 space-y-3">
              <Badge variant="secondary">{20 - index * 3}% off</Badge>
              <Link to={`/product/${item.id}`} className="font-semibold hover:text-primary">
                {item.title}
              </Link>
              <p className="font-bold">R {item.price.toLocaleString('en-ZA')}</p>
              <Button
                className="w-full"
                onClick={() => {
                  addToCart(item.id);
                  toast.success('Deal added to cart');
                }}
              >
                Add deal
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}

export function SellerToolsPage() {
  return (
    <PageShell
      title="AI Listing Generator"
      description="Create draft listings with structured seller-ready fields."
    >
      <Card>
        <CardContent className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <MetricCard title="Draft quality" value="92%" detail="Completeness score target" />
          <MetricCard title="Photos needed" value="4" detail="Recommended listing image set" />
          <MetricCard title="Trust checks" value="3" detail="Proof, warranty, delivery" />
          <Button asChild className="lg:col-span-3">
            <Link to="/seller">Open seller dashboard generator</Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export function PricingToolsPage() {
  return (
    <PageShell
      title="Pricing Tools"
      description="Compare marketplace prices, margins, and recommended discounts."
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard title="Median market price" value="R 18,999" detail="Based on active electronics listings" />
        <MetricCard title="Recommended discount" value="8%" detail="For faster conversion" />
        <MetricCard title="Platform fee estimate" value="12%" detail="Used in seller payout previews" />
      </div>
    </PageShell>
  );
}

export function StoreCreate() {
  const [storeName, setStoreName] = React.useState('');

  return (
    <PageShell
      title="Create Storefront"
      description="Set up your business presence before publishing listings."
    >
      <Card>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="Store name" />
          <Input placeholder="Business category" />
          <Input placeholder="City or service area" />
          <Input placeholder="Support email" />
          <Button
            className="md:col-span-2"
            onClick={() => toast.success(`${storeName || 'Storefront'} draft created`)}
          >
            Save storefront draft
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export function StoreDetail() {
  const { id } = useParams();
  const [store, setStore] = React.useState<StoreProfile | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!id) return;
    setLoading(true);
    getStoreById(id)
      .then(setStore)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <PageShell title="Loading store" description="Fetching storefront details...">
        <p className="text-muted-foreground">Loading...</p>
      </PageShell>
    );
  }

  if (!store) {
    return <DetailNotFound label="Store" />;
  }

  return (
    <PageShell title={store.name} description={store.description}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard title="Rating" value={String(store.rating)} detail={store.category} />
        <MetricCard title="Followers" value={store.followers.toLocaleString('en-ZA')} detail={store.location} />
        <MetricCard title="Verification" value="Ready" detail="Business profile checks available" />
      </div>
    </PageShell>
  );
}

export function ServiceDetail() {
  const { id } = useParams();
  const { requestServiceBooking } = useApp();
  const [service, setService] = React.useState<Service | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!id) return;
    setLoading(true);
    getServiceById(id)
      .then(setService)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <PageShell title="Loading service" description="Fetching service details...">
        <p className="text-muted-foreground">Loading...</p>
      </PageShell>
    );
  }

  if (!service) {
    return <DetailNotFound label="Service" />;
  }

  return (
    <PageShell title={service.title} description={service.description}>
      <Card>
        <CardContent className="p-6 space-y-4">
          <p className="text-muted-foreground">{service.provider} - {service.location}</p>
          <Badge variant="outline">{service.priceLabel}</Badge>
          <Button
            onClick={() => {
              requestServiceBooking(service.id, service.title, service.provider, 'Detail page booking request');
              toast.success('Booking request sent');
            }}
          >
            Request booking
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export function RentalDetail() {
  const { id } = useParams();
  const { requestRentalReservation } = useApp();
  const [rental, setRental] = React.useState<Rental | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!id) return;
    setLoading(true);
    getRentalById(id)
      .then(setRental)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <PageShell title="Loading rental" description="Fetching rental details...">
        <p className="text-muted-foreground">Loading...</p>
      </PageShell>
    );
  }

  if (!rental) {
    return <DetailNotFound label="Rental" />;
  }

  return (
    <PageShell title={rental.title} description={rental.description}>
      <Card>
        <CardContent className="p-6 space-y-4">
          <p className="text-muted-foreground">{rental.owner} - {rental.location}</p>
          <p className="font-bold">R {rental.dailyRate.toLocaleString('en-ZA')} / day</p>
          <Button
            onClick={() => {
              requestRentalReservation(rental.id, rental.title, 'Next Friday', 'Next Sunday');
              toast.success('Rental availability requested');
            }}
          >
            Request availability
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export function JobDetail() {
  const { id } = useParams();
  const { submitJobApplication, user } = useApp();
  const [job, setJob] = React.useState<Job | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!id) return;
    setLoading(true);
    getJobById(id)
      .then(setJob)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <PageShell title="Loading job" description="Fetching job details...">
        <p className="text-muted-foreground">Loading...</p>
      </PageShell>
    );
  }

  if (!job) {
    return <DetailNotFound label="Job" />;
  }

  return (
    <PageShell title={job.title} description={job.description}>
      <Card>
        <CardContent className="p-6 space-y-4">
          <p className="text-muted-foreground">{job.company} - {job.location}</p>
          <Badge variant="outline">{job.type}</Badge>
          <p className="font-semibold">{job.salaryLabel}</p>
          <Button
            onClick={() => {
              submitJobApplication(job.id, job.title, user?.name ?? 'GridStore candidate', `${job.id}-cv.pdf`);
              toast.success('Application submitted');
            }}
          >
            Apply now
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export function CvUpload() {
  return (
    <PageShell title="Upload CV" description="Attach a CV profile for job applications.">
      <Card>
        <CardContent className="p-6 space-y-3">
          <Input type="file" aria-label="Upload CV" />
          <Button onClick={() => toast.success('CV profile saved')}>Save CV profile</Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export function EmployerDashboard() {
  return (
    <PageShell title="Employer Dashboard" description="Manage company roles and candidate applications.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard title="Open roles" value={String(jobs.length)} detail="Jobs visible to candidates" />
        <MetricCard title="Applications" value="12" detail="Candidate pipeline preview" />
        <MetricCard title="Shortlist" value="4" detail="Ready for review" />
      </div>
    </PageShell>
  );
}

export function HelpCenter() {
  return (
    <PageShell title="Help Center" description="Common buyer, seller, checkout, and safety support paths.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['Orders and refunds', 'Seller onboarding', 'Payments and payouts', 'Reporting a listing'].map((item) => (
          <Card key={item}>
            <CardHeader>
              <CardTitle>{item}</CardTitle>
              <CardDescription>Guided support article and contact workflow.</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}

export function TrustSafety() {
  const { trustReports } = useApp();

  return (
    <PageShell
      title="Trust & Safety"
      description="Verification, reports, moderation, disputes, and marketplace risk signals."
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard title="Open reports" value={String(trustReports.length)} detail="Needs review" />
        <MetricCard title="Verification" value="Active" detail="Seller and storefront checks" />
        <MetricCard title="Disputes" value="0" detail="Current escalations" />
      </div>
    </PageShell>
  );
}

export function Advertising() {
  return (
    <PageShell title="Advertising" description="Promote listings, stores, and flash sales.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard title="Starter boost" value="R 250" detail="7-day listing promotion" />
        <MetricCard title="Store spotlight" value="R 900" detail="Category placement" />
        <MetricCard title="Flash placement" value="R 1,500" detail="Homepage deal slot" />
      </div>
    </PageShell>
  );
}

export function LocaleSettings() {
  return (
    <PageShell title="Region & Currency" description="Local marketplace settings for South Africa.">
      <Card>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input value="South Africa" readOnly />
          <Input value="ZAR" readOnly />
          <Button className="md:col-span-2" onClick={() => toast.success('Region settings saved')}>
            Save region settings
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export function ProfileSettings() {
  const { user, updateProfile } = useApp();
  const [name, setName] = React.useState(user?.name ?? '');
  const [email, setEmail] = React.useState(user?.email ?? '');

  React.useEffect(() => {
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
  }, [user]);

  const saveProfile = async () => {
    try {
      await updateProfile({ name, email });
      toast.success('Profile settings saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save profile');
    }
  };

  return (
    <PageShell title="Profile Settings" description="Account, role, notifications, and saved preferences.">
      <Card>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" />
          <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
          <Input value={user?.role ?? 'buyer'} readOnly placeholder="Role" />
          <Button onClick={saveProfile} disabled={!user}>
            Save profile
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export function BookingDetail() {
  const { id } = useParams();

  return (
    <PageShell title="Booking Detail" description={`Booking reference ${id ?? 'new'}`}>
      <Card>
        <CardContent className="p-6 space-y-3">
          <Badge variant="secondary">Requested</Badge>
          <p className="text-muted-foreground">Provider quote, schedule, and conversation controls live here.</p>
          <Button asChild>
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}

