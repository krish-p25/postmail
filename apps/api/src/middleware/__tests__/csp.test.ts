import { Request, Response } from 'express';
import { dashboardCsp } from '../csp';

function mockRes() {
  const headers: Record<string, string> = {};
  return {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    headers,
  } as unknown as Response & { headers: Record<string, string> };
}

it('sets a report-only CSP, never an enforcing one', () => {
  const res = mockRes();
  const next = jest.fn();
  dashboardCsp({} as Request, res, next);

  expect(res.headers['Content-Security-Policy-Report-Only']).toEqual(expect.any(String));
  expect(res.headers['Content-Security-Policy']).toBeUndefined();
  expect(next).toHaveBeenCalledTimes(1);
});

it('allows blob: for the attachment preview iframes/img/video/audio, but locks down object-src', () => {
  const res = mockRes();
  dashboardCsp({} as Request, res, jest.fn());
  const policy = res.headers['Content-Security-Policy-Report-Only'];

  expect(policy).toMatch(/img-src[^;]*\bblob:/);
  expect(policy).toMatch(/frame-src[^;]*\bblob:/);
  expect(policy).toMatch(/media-src[^;]*\bblob:/);
  expect(policy).toMatch(/object-src 'none'/);
});

it('does not allow unsafe-inline for scripts (only style, for the app-wide inline style={{}} usage)', () => {
  const res = mockRes();
  dashboardCsp({} as Request, res, jest.fn());
  const policy = res.headers['Content-Security-Policy-Report-Only'];
  const directives = Object.fromEntries(policy.split('; ').map((d) => [d.split(' ')[0], d]));

  expect(directives['script-src']).toBe("script-src 'self'");
  expect(directives['style-src']).toMatch(/'unsafe-inline'/);
});
