/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock Chrome extension APIs
(global as any).chrome = {
  runtime: {
    onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
    onInstalled: { addListener: jest.fn() },
    sendMessage: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn((_keys: any, cb: any) => cb({})),
      set: jest.fn((_items: any, cb?: any) => cb?.()),
    },
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
  },
};

// Ensure crypto.randomUUID is available in jsdom
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.randomUUID) {
  const { randomUUID } = require('crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID, getRandomValues: require('crypto').getRandomValues },
    writable: true,
  });
}
