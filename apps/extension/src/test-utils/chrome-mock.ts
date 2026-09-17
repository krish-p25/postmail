/* eslint-disable @typescript-eslint/no-explicit-any */

/** A chrome event whose listeners tests can trigger with emit(). */
export interface MockEvent {
  addListener: jest.Mock;
  removeListener: jest.Mock;
  emit: (...args: any[]) => void;
}

function mockEvent(): MockEvent {
  const listeners: Array<(...args: any[]) => void> = [];
  return {
    addListener: jest.fn((listener: (...args: any[]) => void) => listeners.push(listener)),
    removeListener: jest.fn(),
    emit: (...args: any[]) => listeners.forEach((listener) => listener(...args)),
  };
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Fresh chrome mock with a real in-memory storage.session. Install with `global.chrome = createChromeMock().chrome`. */
export function createChromeMock() {
  const sessionStore: Record<string, unknown> = {};
  const keysOf = (keys: string | string[]) => (Array.isArray(keys) ? keys : [keys]);

  const chrome = {
    runtime: { onMessage: mockEvent(), onInstalled: mockEvent(), sendMessage: jest.fn(), lastError: undefined },
    storage: {
      local: {
        get: jest.fn((_keys: any, cb?: (items: any) => void) => cb?.({})),
        set: jest.fn((_items: any, cb?: () => void) => cb?.()),
        remove: jest.fn(),
      },
      session: {
        get: jest.fn(async (keys: string | string[]) =>
          Object.fromEntries(keysOf(keys).filter((k) => k in sessionStore).map((k) => [k, clone(sessionStore[k])])),
        ),
        set: jest.fn(async (items: Record<string, unknown>) => {
          Object.assign(sessionStore, clone(items));
        }),
        remove: jest.fn(async (keys: string | string[]) => {
          for (const k of keysOf(keys)) delete sessionStore[k];
        }),
      },
      onChanged: mockEvent(),
    },
    tabs: { query: jest.fn(), sendMessage: jest.fn(), onRemoved: mockEvent() },
    webRequest: { onCompleted: mockEvent() },
  };

  return { chrome, sessionStore };
}

/** Let pending promise callbacks run. */
export const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));
