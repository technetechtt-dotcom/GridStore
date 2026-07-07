import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { userFeaturesStore } from '../store/userFeatures/index.js';

export const applicationsRouter = Router();

const applicationSchema = z.object({
  jobId: z.string(),
  jobTitle: z.string(),
  applicantName: z.string().optional(),
  cvFileName: z.string().optional(),
});

applicationsRouter.use(requireAuth);

applicationsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const items = await userFeaturesStore.listApplications(req.user!.id);
  res.json(items);
});

applicationsRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const parsed = applicationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid application payload' });
    return;
  }

  const application = await userFeaturesStore.createApplication(req.user!.id, {
    jobId: parsed.data.jobId,
    jobTitle: parsed.data.jobTitle,
    applicantName: parsed.data.applicantName?.trim() || req.user!.name,
    cvFileName: parsed.data.cvFileName || 'profile-cv.pdf',
  });
  res.status(201).json(application);
});
