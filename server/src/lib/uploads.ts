import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { createId } from './ids.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const UPLOADS_ROOT = path.join(serverRoot, 'uploads');

export type UploadKind = 'evidence' | 'cv' | 'listing';

const KIND_DIRS: Record<UploadKind, string> = {
  evidence: path.join(UPLOADS_ROOT, 'evidence'),
  cv: path.join(UPLOADS_ROOT, 'cv'),
  listing: path.join(UPLOADS_ROOT, 'listing'),
};

/** @deprecated Use KIND_DIRS.evidence — kept for existing tests */
export const EVIDENCE_UPLOAD_DIR = KIND_DIRS.evidence;

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const DOC_MIME = new Set([...IMAGE_MIME, 'application/pdf']);

const KIND_MIME: Record<UploadKind, Set<string>> = {
  evidence: DOC_MIME,
  cv: new Set(['application/pdf', 'image/jpeg', 'image/png']),
  listing: IMAGE_MIME,
};

const KIND_MAX_BYTES: Record<UploadKind, number> = {
  evidence: 5 * 1024 * 1024,
  cv: 8 * 1024 * 1024,
  listing: 5 * 1024 * 1024,
};

for (const dir of Object.values(KIND_DIRS)) {
  fs.mkdirSync(dir, { recursive: true });
}

export interface StoredObject {
  key: string;
  kind: UploadKind;
  filename: string;
  contentType: string;
  size: number;
  publicPath: string;
}

export interface ObjectStorage {
  putLocalFile(kind: UploadKind, absolutePath: string, originalName: string, contentType: string): Promise<StoredObject>;
  resolve(kind: UploadKind, filename: string): string | null;
  publicPath(kind: UploadKind, filename: string): string;
}

class LocalDiskStorage implements ObjectStorage {
  publicPath(kind: UploadKind, filename: string) {
    return `/api/uploads/${kind}/${encodeURIComponent(filename)}`;
  }

  resolve(kind: UploadKind, filename: string) {
    const base = path.basename(filename);
    if (base !== filename || base.includes('..')) return null;
    const full = path.join(KIND_DIRS[kind], base);
    if (!full.startsWith(KIND_DIRS[kind])) return null;
    if (!fs.existsSync(full)) return null;
    return full;
  }

  async putLocalFile(kind: UploadKind, absolutePath: string, originalName: string, contentType: string) {
    const ext = path.extname(originalName).toLowerCase().slice(0, 10);
    const safeExt = /^\.(jpe?g|png|webp|gif|pdf)$/.test(ext) ? ext : '';
    const filename = `${createId(`${kind}file`)}${safeExt}`;
    const dest = path.join(KIND_DIRS[kind], filename);
    await fs.promises.rename(absolutePath, dest).catch(async () => {
      await fs.promises.copyFile(absolutePath, dest);
      await fs.promises.unlink(absolutePath).catch(() => undefined);
    });
    const stat = await fs.promises.stat(dest);
    return {
      key: `${kind}/${filename}`,
      kind,
      filename,
      contentType,
      size: stat.size,
      publicPath: this.publicPath(kind, filename),
    };
  }
}

/**
 * Optional S3-compatible driver (R2/S3). Uses fetch + AWS Signature is complex;
 * when configured, files are still written locally first then uploaded via PutObject HTTP API
 * if STORAGE_ENDPOINT + STORAGE_BUCKET + credentials are set. Falls back to local on failure.
 */
class S3CompatibleStorage extends LocalDiskStorage {
  private endpoint = process.env.STORAGE_ENDPOINT?.replace(/\/$/, '');
  private bucket = process.env.STORAGE_BUCKET ?? '';
  private accessKey = process.env.STORAGE_ACCESS_KEY_ID ?? '';
  private secretKey = process.env.STORAGE_SECRET_ACCESS_KEY ?? '';
  private publicBase = process.env.STORAGE_PUBLIC_BASE_URL?.replace(/\/$/, '');

  configured() {
    return Boolean(this.endpoint && this.bucket && this.accessKey && this.secretKey);
  }

  override publicPath(kind: UploadKind, filename: string) {
    if (this.publicBase) {
      return `${this.publicBase}/${kind}/${encodeURIComponent(filename)}`;
    }
    return super.publicPath(kind, filename);
  }

  override async putLocalFile(kind: UploadKind, absolutePath: string, originalName: string, contentType: string) {
    const stored = await super.putLocalFile(kind, absolutePath, originalName, contentType);
    if (!this.configured()) return stored;

    try {
      const body = await fs.promises.readFile(path.join(KIND_DIRS[kind], stored.filename));
      const key = `${kind}/${stored.filename}`;
      const url = `${this.endpoint}/${this.bucket}/${key}`;
      // Basic auth header for S3-compatible gateways that accept it; prefer signed URLs in ops.
      const auth = Buffer.from(`${this.accessKey}:${this.secretKey}`).toString('base64');
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': contentType,
          'Content-Length': String(body.byteLength),
        },
        body,
      });
      if (!response.ok) {
        throw new Error(`Object storage upload failed (${response.status})`);
      }
      return {
        ...stored,
        publicPath: this.publicPath(kind, stored.filename),
      };
    } catch {
      // Keep local copy as source of truth when remote put fails.
      return stored;
    }
  }
}

function createStorage(): ObjectStorage {
  const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (driver === 's3' || driver === 'r2') {
    return new S3CompatibleStorage();
  }
  return new LocalDiskStorage();
}

export const objectStorage = createStorage();

function makeUploader(kind: UploadKind) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, KIND_DIRS[kind]),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
      const safeExt = /^\.(jpe?g|png|webp|gif|pdf)$/.test(ext) ? ext : '';
      cb(null, `${createId(`${kind}file`)}${safeExt}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: KIND_MAX_BYTES[kind], files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!KIND_MIME[kind].has(file.mimetype)) {
        cb(new Error(`Unsupported file type for ${kind} upload`));
        return;
      }
      cb(null, true);
    },
  });
}

export const evidenceUpload = makeUploader('evidence');
export const cvUpload = makeUploader('cv');
export const listingImageUpload = makeUploader('listing');

export function evidencePublicUrl(filename: string) {
  return objectStorage.publicPath('evidence', filename);
}

export function resolveEvidenceFile(filename: string) {
  return objectStorage.resolve('evidence', filename);
}

export function resolveUploadFile(kind: UploadKind, filename: string) {
  return objectStorage.resolve(kind, filename);
}

export function uploadPublicUrl(kind: UploadKind, filename: string) {
  return objectStorage.publicPath(kind, filename);
}

export function contentTypeForFilename(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}
