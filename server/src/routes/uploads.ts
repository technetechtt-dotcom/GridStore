import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { evidencePublicUrl, evidenceUpload, resolveEvidenceFile } from '../lib/uploads.js';

export const uploadsRouter = Router();

uploadsRouter.post(
  '/evidence',
  requireAuth,
  (req: AuthenticatedRequest, res, next) => {
    evidenceUpload.single('file')(req, res, (error: unknown) => {
      if (error) {
        res.status(400).json({
          error: error instanceof Error ? error.message : 'Upload failed',
        });
        return;
      }
      next();
    });
  },
  (req: AuthenticatedRequest, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'file is required' });
      return;
    }
    res.status(201).json({
      url: evidencePublicUrl(file.filename),
      attachmentName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    });
  }
);

uploadsRouter.get('/evidence/:filename', requireAuth, (req: AuthenticatedRequest, res) => {
  const full = resolveEvidenceFile(req.params.filename);
  if (!full) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  const ext = path.extname(full).toLowerCase();
  const type =
    ext === '.pdf'
      ? 'application/pdf'
      : ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/jpeg';
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(full).pipe(res);
});
