import { Response } from 'express';
import { ChallengeError } from '../services/challenges';

/** Send a ChallengeError as its own status/body; anything else is logged and returned as a 500. */
export function handleRouteError(res: Response, error: unknown, context: string, fallbackMessage: string): void {
  if (error instanceof ChallengeError) {
    res.status(error.status).json(error.toJSON());
    return;
  }
  console.error(`[PostMail API] ${context}:`, error);
  res.status(500).json({ error: fallbackMessage });
}
