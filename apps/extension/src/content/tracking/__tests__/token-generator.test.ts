import { generateTrackingToken } from '../token-generator';

describe('generateTrackingToken', () => {
  it('returns a string', () => {
    const token = generateTrackingToken();
    expect(typeof token).toBe('string');
  });

  it('returns a UUID-format string', () => {
    const token = generateTrackingToken();
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateTrackingToken()));
    expect(tokens.size).toBe(100);
  });
});
