import { SELECTORS, isComposeDialog, findReplyComposeContainer } from './selectors';

export interface ComposeDetectorCallbacks {
  onComposeDetected: (element: HTMLElement) => void;
  onComposeRemoved: (element: HTMLElement) => void;
}

/**
 * Detects Gmail compose window and inline reply/forward appearance and removal.
 *
 * Uses MutationObserver on document.body to watch for:
 *   1. Dialog elements with a subjectbox input (new compose windows)
 *   2. Inline g_editable textboxes not in a dialog (reply/forward composes)
 */
export class ComposeDetector {
  private observer: MutationObserver | null = null;
  private trackedComposes = new Set<HTMLElement>();
  private callbacks: ComposeDetectorCallbacks;

  constructor(callbacks: ComposeDetectorCallbacks) {
    this.callbacks = callbacks;
  }

  start(): void {
    console.log('[PostMail][Detector] Starting, scanning for existing compose windows...');
    this.scan();

    this.observer = new MutationObserver(() => this.scan());
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    console.log('[PostMail][Detector] MutationObserver started');
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.trackedComposes.clear();
  }

  private scan(): void {
    const currentComposes = new Set<HTMLElement>();

    // 1. Fullscreen compose dialogs (new compose, popped-out reply)
    const dialogs = document.querySelectorAll(SELECTORS.COMPOSE_DIALOG);
    dialogs.forEach((dialog) => {
      const el = dialog as HTMLElement;
      if (!isComposeDialog(el)) return;
      currentComposes.add(el);
    });

    // 2. Inline reply/forward compose areas
    const editableBodies = document.querySelectorAll(
      `${SELECTORS.COMPOSE_BODY}, ${SELECTORS.COMPOSE_BODY_FALLBACK}`,
    );
    editableBodies.forEach((body) => {
      const el = body as HTMLElement;
      // Skip if inside a dialog (already handled above)
      if (el.closest('div[role="dialog"]')) return;
      // Skip if already tracked via its container
      const container = findReplyComposeContainer(el);
      if (!container) return;
      // Skip if this container is already in the current set
      if (currentComposes.has(container)) return;
      currentComposes.add(container);
    });

    // Detect new composes
    for (const el of currentComposes) {
      if (!this.trackedComposes.has(el)) {
        const isReply = !el.matches('div[role="dialog"]');
        console.log(`[PostMail][Detector] New ${isReply ? 'reply' : 'compose'} detected`);
        this.trackedComposes.add(el);
        this.callbacks.onComposeDetected(el);
      }
    }

    // Detect removed composes
    for (const tracked of this.trackedComposes) {
      if (!currentComposes.has(tracked) || !document.body.contains(tracked)) {
        console.log('[PostMail][Detector] Compose removed');
        this.trackedComposes.delete(tracked);
        this.callbacks.onComposeRemoved(tracked);
      }
    }
  }
}
