import { Router } from 'express';
import { z } from 'zod';
import { buildAiAnswer } from '../services/aiAssistant.js';

export const aiRouter = Router();

const assistSchema = z.object({
  prompt: z.string(),
});

aiRouter.post('/assist', (req, res) => {
  const parsed = assistSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }

  res.json({ answer: buildAiAnswer(parsed.data.prompt) });
});
