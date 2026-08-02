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
  cvUrl: z
    .union([z.string().url(), z.string().regex(/^\/api\/uploads\/cv\/[A-Za-z0-9._-]+$/)])
    .optional(),
});

applicationsRouter.use(requireAuth);

applicationsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;
  const scope = typeof req.query.scope === 'string' ? req.query.scope : 'mine';
  const canReview =
    ['admin', 'moderator', 'seller'].includes(req.user!.role) || scope === 'employer';

  if (jobId) {
    if (!canReview && scope === 'employer') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (scope === 'employer' || canReview) {
      if (!['admin', 'moderator', 'seller'].includes(req.user!.role)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      res.json(await userFeaturesStore.listApplicationsForJob(jobId));
      return;
    }
  }

  if (scope === 'employer') {
    if (!['admin', 'moderator', 'seller'].includes(req.user!.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json(await userFeaturesStore.listAllApplications());
    return;
  }

  res.json(await userFeaturesStore.listApplications(req.user!.id));
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
    cvUrl: parsed.data.cvUrl,
  });
  res.status(201).json(application);
});
