import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requirePrivilegedMfa } from '../middleware/mfa.js';
import { requireAdmin, requireModerator } from '../middleware/roles.js';
import { listSecurityEvents, recordSecurityEvent } from '../lib/security.js';
import { platformStore } from '../store/index.js';
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
  resetAdminUserPassword,
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
adminRouter.use(requirePrivilegedMfa);
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
      currentPassword: z.string().min(1).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user payload' });
    return;
  }

  try {
    if (parsed.data.role === 'admin' || parsed.data.role === 'moderator') {
      if (!parsed.data.currentPassword) {
        res.status(400).json({ error: 'Reauthentication required to grant privileged roles' });
        return;
      }
      const actor = (req as import('../middleware/auth.js').AuthenticatedRequest).user;
      const valid = actor
        ? await platformStore.verifyPassword(actor.id, parsed.data.currentPassword)
        : false;
      if (!valid) {
        recordSecurityEvent('admin.role_grant.reauth_failed', {
          actorId: actor?.id,
          targetId: req.params.id,
          ip: req.ip,
          requestId: req.requestId,
        });
        res.status(401).json({ error: 'Reauthentication failed' });
        return;
      }
    }

    const { currentPassword: _password, ...patch } = parsed.data;
    const user = await updateAdminUser(req.params.id, patch);
    if (patch.role) {
      recordSecurityEvent('admin.role_changed', {
        actorId: (req as import('../middleware/auth.js').AuthenticatedRequest).user?.id,
        targetId: req.params.id,
        ip: req.ip,
        requestId: req.requestId,
        detail: { role: patch.role },
      });
    }
    res.json(user);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update user';
    res.status(404).json({ error: message });
  }
});

adminRouter.post('/users/:id/reset-password', requireAdmin, async (req, res) => {
  const parsed = z.object({ password: z.string().min(10) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Password must meet policy requirements' });
    return;
  }

  try {
    const user = await resetAdminUserPassword(req.params.id, parsed.data.password);
    recordSecurityEvent('admin.password_reset', {
      actorId: (req as import('../middleware/auth.js').AuthenticatedRequest).user?.id,
      targetId: req.params.id,
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json({
      id: user.id,
      email: user.email,
      mustChangePassword: true,
      message: 'Password reset. The new password is not returned in API responses.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reset password';
    const status = message === 'User not found' ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

adminRouter.get('/security-events', requireAdmin, (_req, res) => {
  res.json({ events: listSecurityEvents(100) });
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
        .enum([
          'pending_payment',
          'paid',
          'processing',
          'shipped',
          'delivered',
          'refunded',
          'cancelled',
        ])
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
