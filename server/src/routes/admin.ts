import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin, requireModerator } from '../middleware/roles.js';
import {
  getAdminAnalytics,
  getAdminStats,
  listAdminAuctions,
  listAdminJobs,
  listAdminListings,
  listAdminMarketplaceProducts,
  listAdminOrders,
  listAdminPayments,
  listAdminRentals,
  listAdminReports,
  listAdminServices,
  listAdminStores,
  listAdminUsers,
  updateAdminAuction,
  updateAdminJob,
  updateAdminListing,
  updateAdminMarketplaceProduct,
  updateAdminOrder,
  updateAdminRental,
  updateAdminReport,
  updateAdminService,
  updateAdminStore,
  updateAdminUser,
} from '../services/adminService.js';

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(requireModerator);

adminRouter.get('/stats', async (_req, res) => {
  res.json(await getAdminStats());
});

adminRouter.get('/analytics', async (_req, res) => {
  res.json(await getAdminAnalytics());
});

adminRouter.get('/users', requireAdmin, async (_req, res) => {
  res.json(await listAdminUsers());
});

adminRouter.patch('/users/:id', requireAdmin, async (req, res) => {
  const parsed = z
    .object({
      role: z.enum(['buyer', 'seller', 'moderator', 'admin']).optional(),
      verified: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user payload' });
    return;
  }

  try {
    const user = await updateAdminUser(req.params.id, parsed.data);
    res.json(user);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update user';
    res.status(404).json({ error: message });
  }
});

adminRouter.get('/listings', async (_req, res) => {
  res.json(await listAdminListings());
});

adminRouter.patch('/listings/:id', async (req, res) => {
  const parsed = z
    .object({ status: z.enum(['active', 'draft', 'paused', 'flagged']) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid listing payload' });
    return;
  }

  try {
    const listing = await updateAdminListing(req.params.id, parsed.data.status);
    res.json(listing);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update listing';
    res.status(404).json({ error: message });
  }
});

adminRouter.get('/orders', async (_req, res) => {
  res.json(await listAdminOrders());
});

adminRouter.patch('/orders/:id', async (req, res) => {
  const parsed = z
    .object({
      status: z
        .enum(['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'refunded'])
        .optional(),
      paymentStatus: z.enum(['requires_provider', 'authorized', 'paid', 'refunded']).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid order payload' });
    return;
  }

  try {
    const order = await updateAdminOrder(req.params.id, parsed.data);
    res.json(order);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update order';
    res.status(404).json({ error: message });
  }
});

adminRouter.get('/payments', async (_req, res) => {
  res.json(await listAdminPayments());
});

adminRouter.get('/reports', async (_req, res) => {
  res.json(await listAdminReports());
});

adminRouter.patch('/reports/:id', async (req, res) => {
  const parsed = z.object({ status: z.enum(['open', 'in_review', 'resolved']) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid report payload' });
    return;
  }

  try {
    const report = await updateAdminReport(req.params.id, parsed.data.status);
    res.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update report';
    res.status(404).json({ error: message });
  }
});

adminRouter.get('/stores', async (_req, res) => {
  res.json(await listAdminStores());
});

adminRouter.patch('/stores/:id', async (req, res) => {
  const parsed = z
    .object({
      name: z.string().min(2).optional(),
      category: z.string().min(2).optional(),
      location: z.string().min(2).optional(),
      description: z.string().min(10).optional(),
      supportEmail: z.string().email().optional(),
      status: z.enum(['active', 'draft', 'paused']).optional(),
      verified: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid store payload' });
    return;
  }

  try {
    const store = await updateAdminStore(req.params.id, parsed.data);
    res.json(store);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update store';
    res.status(404).json({ error: message });
  }
});

const catalogStatusSchema = z.enum(['active', 'paused', 'flagged']);

adminRouter.get('/marketplace', async (_req, res) => {
  res.json(await listAdminMarketplaceProducts());
});

adminRouter.patch('/marketplace/:id', async (req, res) => {
  const parsed = z
    .object({
      title: z.string().min(2).optional(),
      category: z.string().min(2).optional(),
      price: z.number().nonnegative().optional(),
      seller: z.string().min(2).optional(),
      location: z.string().min(2).optional(),
      description: z.string().min(10).optional(),
      badge: z.string().optional(),
      status: catalogStatusSchema.optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid marketplace product payload' });
    return;
  }

  try {
    const product = await updateAdminMarketplaceProduct(req.params.id, parsed.data);
    res.json(product);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update product';
    res.status(404).json({ error: message });
  }
});

adminRouter.get('/services', async (_req, res) => {
  res.json(await listAdminServices());
});

adminRouter.patch('/services/:id', async (req, res) => {
  const parsed = z
    .object({
      title: z.string().min(2).optional(),
      provider: z.string().min(2).optional(),
      category: z.string().min(2).optional(),
      priceLabel: z.string().min(2).optional(),
      location: z.string().min(2).optional(),
      description: z.string().min(10).optional(),
      status: catalogStatusSchema.optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid service payload' });
    return;
  }

  try {
    const service = await updateAdminService(req.params.id, parsed.data);
    res.json(service);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update service';
    res.status(404).json({ error: message });
  }
});

adminRouter.get('/rentals', async (_req, res) => {
  res.json(await listAdminRentals());
});

adminRouter.patch('/rentals/:id', async (req, res) => {
  const parsed = z
    .object({
      title: z.string().min(2).optional(),
      owner: z.string().min(2).optional(),
      category: z.string().min(2).optional(),
      dailyRate: z.number().nonnegative().optional(),
      location: z.string().min(2).optional(),
      description: z.string().min(10).optional(),
      status: catalogStatusSchema.optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid rental payload' });
    return;
  }

  try {
    const rental = await updateAdminRental(req.params.id, parsed.data);
    res.json(rental);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update rental';
    res.status(404).json({ error: message });
  }
});

adminRouter.get('/jobs', async (_req, res) => {
  res.json(await listAdminJobs());
});

adminRouter.patch('/jobs/:id', async (req, res) => {
  const parsed = z
    .object({
      title: z.string().min(2).optional(),
      company: z.string().min(2).optional(),
      location: z.string().min(2).optional(),
      salaryLabel: z.string().min(2).optional(),
      type: z.string().min(2).optional(),
      description: z.string().min(10).optional(),
      status: catalogStatusSchema.optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid job payload' });
    return;
  }

  try {
    const job = await updateAdminJob(req.params.id, parsed.data);
    res.json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update job';
    res.status(404).json({ error: message });
  }
});

adminRouter.get('/auctions', async (_req, res) => {
  res.json(await listAdminAuctions());
});

adminRouter.patch('/auctions/:id', async (req, res) => {
  const parsed = z
    .object({
      status: z.enum(['active', 'draft', 'paused', 'flagged']).optional(),
      auctionStatus: z.enum(['none', 'live', 'ended']).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid auction payload' });
    return;
  }

  try {
    const auction = await updateAdminAuction(req.params.id, parsed.data);
    res.json(auction);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update auction';
    res.status(404).json({ error: message });
  }
});

adminRouter.get('/settings', requireAdmin, (_req, res) => {
  res.json({
    features: [
      { key: 'ai_assistant', label: 'Enable AI Shopping Assistant', enabled: true },
      { key: 'escrow_payments', label: 'Enable Escrow Payments', enabled: false },
      { key: 'seller_subscriptions', label: 'Enable Seller Subscriptions', enabled: false },
      { key: 'instant_eft', label: 'Enable Instant EFT', enabled: true },
      { key: 'dark_mode_default', label: 'Enable Dark Mode Default', enabled: true },
    ],
    regions: ['Western Cape', 'Gauteng', 'KwaZulu-Natal', 'National'],
    environment: process.env.NODE_ENV ?? 'development',
  });
});
