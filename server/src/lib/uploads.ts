import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { createId } from './ids.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const EVIDENCE_UPLOAD_DIR = path.join(serverRoot, 'uploads', 'evidence');

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

fs.mkdirSync(EVIDENCE_UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, EVIDENCE_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    const safeExt = /^\.(jpe?g|png|webp|gif|pdf)$/.test(ext) ? ext : '';
    cb(null, `${createId('evidfile')}${safeExt}`);
  },
});

export const evidenceUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, WebP, GIF, or PDF evidence is allowed'));
      return;
    }
    cb(null, true);
  },
});

export function evidencePublicUrl(filename: string) {
  return `/api/uploads/evidence/${encodeURIComponent(filename)}`;
}

export function resolveEvidenceFile(filename: string) {
  const base = path.basename(filename);
  if (base !== filename || base.includes('..')) return null;
  const full = path.join(EVIDENCE_UPLOAD_DIR, base);
  if (!full.startsWith(EVIDENCE_UPLOAD_DIR)) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}
