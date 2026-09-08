import { findSubjectInputs, findComposeContainer, findAllBodies, findReplyComposeContainer, debugLogDomElements } from './selectors';
import { ComposeDetectorCallbacks } from '../compose-manager';

/**
 * Detects Outlook Web compose window and inline reply/forward appearance and removal.
 *
 * Uses MutationObserver on document.body to watch for:
 *   1. Subject inputs → walk up to find compose container (new compose windows)
 *   2. Body textboxes without a subject input → walk up to find reply container
 *      (quick-reply areas in the reading pane)
 */
export class OutlookComposeDetector {
  private observer: MutationObserver | null = null;
  private trackedComposes = new Set<HTMLElement>();
  private callbacks: ComposeDetectorCallbacks;
  private debugDone = false;

  constructor(callbacks: ComposeDetectorCallbacks) {
    this.callbacks = callbacks;
  }

  start(): void {
    console.log('[PostMail][Outlook:Detector] Starting, scanning for existing compose windows...');
    this.scan();

    this.observer = new MutationObserver(() => this.scan());
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    console.log('[PostMail][Outlook:Detector] MutationObserver started');
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.trackedComposes.clear();
  }

  private scan(): void {
    const currentComposes = new Set<HTMLElement>();

    // 1. Full compose windows (have a subject input)
    const subjectInputs = findSubjectInputs();
    if (subjectInputs) {
      subjectInputs.forEach((input) => {
        const container = findComposeContainer(input as HTMLElement);
        if (!container) return;
        currentComposes.add(container);
      });
    }

    // 2. Inline reply/forward areas (body textbox without a subject input)
    const bodies = findAllBodies();
    if (bodies) {
      bodies.forEach((body) => {
        const el = body as HTMLElement;
        // Skip if already inside a tracked full-compose container
        for (const tracked of currentComposes) {
          if (tracked.contains(el)) return;
        }
        const container = findReplyComposeContainer(el);
        if (!container) return;
        if (currentComposes.has(container)) return;
        currentComposes.add(container);
      });
    }

    // Run debug scan once if nothing found at all
    if (currentComposes.size === 0 && !this.debugDone) {
      setTimeout(() => {
        if (!this.debugDone) {
          this.debugDone = true;
          debugLogDomElements();
        }
      }, 3000);
    }

    // Detect new composes
    for (const container of currentComposes) {
      if (!this.trackedComposes.has(container)) {
        const hasSubject = subjectInputs
          ? Array.from(subjectInputs).some((inp) => container.contains(inp))
          : false;
        console.log(`[PostMail][Outlook:Detector] New ${hasSubject ? 'compose' : 'reply'} detected`);
        this.trackedComposes.add(container);
        this.callbacks.onComposeDetected(container);
      }
    }

    // Detect removed composes
    for (const container of this.trackedComposes) {
      if (!currentComposes.has(container) || !document.body.contains(container)) {
        console.log('[PostMail][Outlook:Detector] Compose removed');
        this.trackedComposes.delete(container);
        this.callbacks.onComposeRemoved(container);
      }
    }
  }
}
