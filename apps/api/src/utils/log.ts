/** ISO timestamp prefix for service log lines. */
export function ts(): string {
  return new Date().toISOString();
}
