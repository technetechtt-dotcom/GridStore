import { Router } from 'express';
import fs from 'node:fs';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  contentTypeForFilename,
  cvUpload,
  evidenceUpload,
  listingImageUpload,
  resolveUploadFile,
  uploadPublicUrl,
  type UploadKind,
} from '../lib/uploads.js';

export const uploadsRouter = Router();

function handleUpload(kind: UploadKind, uploader: typeof evidenceUpload) {
  return [
    requireAuth,
    (req: AuthenticatedRequest, res: import('express').Response, next: import('express').NextFunction) => {
      uploader.single('file')(req, res, (error: unknown) => {
        if (error) {
          res.status(400).json({
            error: error instanceof Error ? error.message : 'Upload failed',
          });
          return;
        }
        next();
      });
    },
    (req: AuthenticatedRequest, res: import('express').Response) => {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'file is required' });
        return;
      }
      res.status(201).json({
        url: uploadPublicUrl(kind, file.filename),
        attachmentName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        kind,
      });
    },
  ] as const;
}

uploadsRouter.post('/evidence', ...handleUpload('evidence', evidenceUpload));
uploadsRouter.post('/cv', ...handleUpload('cv', cvUpload));
uploadsRouter.post('/listing', ...handleUpload('listing', listingImageUpload));

function serveKind(kind: UploadKind) {
  return (req: AuthenticatedRequest, res: import('express').Response) => {
    const full = resolveUploadFile(kind, req.params.filename);
    if (!full) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    res.setHeader('Content-Type', contentTypeForFilename(req.params.filename));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fs.createReadStream(full).pipe(res);
  };
}

uploadsRouter.get('/evidence/:filename', requireAuth, serveKind('evidence'));
uploadsRouter.get('/cv/:filename', requireAuth, serveKind('cv'));
uploadsRouter.get('/listing/:filename', requireAuth, serveKind('listing'));
