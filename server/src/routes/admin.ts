import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin, requireModerator } from '../middleware/roles.js';
import {
  getAdminAnalytics,
  getAdminStats,
  listAdminListings,
  listAdminOrders,
  listAdminPayments,
  listAdminReports,
  listAdminUsers,
  updateAdminListing,
  updateAdminOrder,
  updateAdminReport,
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
