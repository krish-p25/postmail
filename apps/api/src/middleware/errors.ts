import { Request, Response, NextFunction } from 'express';

/**
 * Global error handler middleware.
 * Must be registered last (after all routes).
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('[PostMail API] Unhandled error:', err.message);

  if (process.env.NODE_ENV === 'development') {
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
      stack: err.stack,
    });
  } else {
    res.status(500).json({ error: 'Internal server error' });
  }
}
