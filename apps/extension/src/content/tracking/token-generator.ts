/**
 * Generate a cryptographically secure tracking token.
 * Uses crypto.randomUUID() for high-entropy, opaque identifiers.
 */
export function generateTrackingToken(): string {
  return crypto.randomUUID();
}
