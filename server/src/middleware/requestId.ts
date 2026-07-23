import type { NextFunction, Request, Response } from 'express';
import { createRequestId } from '../lib/security.js';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' && incoming.trim() ? incoming.trim() : createRequestId();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
