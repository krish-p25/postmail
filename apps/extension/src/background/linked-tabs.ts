import { checkAuth } from '../shared/api';

/**
 * Which mail tabs are signed in to a mailbox linked to the PostMail account this
 * extension is logged in to. Only these tabs are ever considered for self-view
 * detection. Kept in chrome.storage.session so it survives service worker restarts.
 */

const TABS_KEY = 'linkedTabs';
const SESSION_KEY = 'linkedSession';
const SESSION_TTL_MS = 5 * 60 * 1000;

export interface LinkedTab {
  accountEmail: string;
  registeredAt: number;
}

interface LinkedSession {
  linkedEmails: string[];
  fetchedAt: number;
}

type TabMap = Record<string, LinkedTab>;

// Serialise read-modify-write updates so concurrent registrations don't overwrite each other.
let queue: Promise<unknown> = Promise.resolve();
function serialised<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function read<T>(key: string): Promise<T | undefined> {
  const items = await chrome.storage.session.get(key);
  return items[key] as T | undefined;
}

export async function clearLinkedState(): Promise<void> {
  await chrome.storage.session.remove([TABS_KEY, SESSION_KEY]);
}

/** Linked mailbox addresses (lowercased), refreshed from the API at most every 5 minutes. */
async function getLinkedEmails(): Promise<string[]> {
  const cached = await read<LinkedSession>(SESSION_KEY);
  if (cached && Date.now() - cached.fetchedAt < SESSION_TTL_MS) return cached.linkedEmails;

  const result = await checkAuth();
  if (result.ok) {
    const linkedEmails = (result.linkedEmails ?? []).map((e) => e.toLowerCase());
    await chrome.storage.session.set({ [SESSION_KEY]: { linkedEmails, fetchedAt: Date.now() } satisfies LinkedSession });
    return linkedEmails;
  }

  if (result.reason === 'no_token' || result.reason === 'token_invalid') {
    await clearLinkedState();
    return [];
  }

  // Server unreachable or erroring: keep using what we knew.
  return cached?.linkedEmails ?? [];
}

export function registerTab(tabId: number, accountEmail: string): Promise<boolean> {
  return serialised(async () => {
    const email = accountEmail.trim().toLowerCase();
    const linkedEmails = await getLinkedEmails();
    const tabs = (await read<TabMap>(TABS_KEY)) ?? {};

    if (!linkedEmails.includes(email)) {
      if (tabs[tabId]) {
        delete tabs[tabId];
        await chrome.storage.session.set({ [TABS_KEY]: tabs });
      }
      return false;
    }

    tabs[tabId] = { accountEmail: email, registeredAt: Date.now() };
    await chrome.storage.session.set({ [TABS_KEY]: tabs });
    return true;
  });
}

export function unregisterTab(tabId: number): Promise<void> {
  return serialised(async () => {
    const tabs = await read<TabMap>(TABS_KEY);
    if (!tabs || !tabs[tabId]) return;
    delete tabs[tabId];
    await chrome.storage.session.set({ [TABS_KEY]: tabs });
  });
}

export async function getLinkedTab(tabId: number): Promise<LinkedTab | null> {
  const tabs = await read<TabMap>(TABS_KEY);
  return tabs?.[tabId] ?? null;
}

/** Forget closed tabs, and start over whenever the PostMail login changes. */
export function watchLinkedTabLifecycle(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    void unregisterTab(tabId);
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && 'apiToken' in changes) {
      void serialised(clearLinkedState);
    }
  });
}
