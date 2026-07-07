import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { userFeaturesStore } from '../store/userFeatures/index.js';

export const messagesRouter = Router();

const sendSchema = z.object({
  text: z.string().min(1),
  author: z.enum(['buyer', 'seller']).optional(),
  title: z.string().optional(),
  participant: z.string().optional(),
});

messagesRouter.use(requireAuth);

messagesRouter.get('/threads', async (req: AuthenticatedRequest, res) => {
  const threads = await userFeaturesStore.listMessageThreads(req.user!.id);
  res.json(threads);
});

messagesRouter.post('/threads/:threadId', async (req: AuthenticatedRequest, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid message payload' });
    return;
  }

  const threads = await userFeaturesStore.sendMessage(
    req.user!.id,
    req.params.threadId,
    parsed.data.text,
    parsed.data.author ?? 'buyer',
    { title: parsed.data.title, participant: parsed.data.participant }
  );
  res.json(threads);
});
