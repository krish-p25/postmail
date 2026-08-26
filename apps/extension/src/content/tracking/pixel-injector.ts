import { findComposeBody } from '../gmail/selectors';
import { TRACKING_PIXEL_ATTR } from '@postmail/shared';

const PIXEL_SELECTOR = `img[${TRACKING_PIXEL_ATTR}]`;

/**
 * Manages injection and removal of a tracking pixel in a Gmail compose body.
 *
 * The pixel is a 1x1 hidden image with a data attribute marker.
 * Only one pixel per compose is maintained — injecting a new URL replaces the old one.
 * Fails safely: returns false if the compose body is not found.
 */
export class PixelInjector {
  private composeElement: HTMLElement;

  constructor(composeElement: HTMLElement) {
    this.composeElement = composeElement;
  }

  /**
   * Inject a tracking pixel with the given URL.
   * Removes any existing pixel first to prevent duplicates.
   * Returns true if injection succeeded, false if body not found.
   */
  inject(trackingUrl: string): boolean {
    try {
      const body = findComposeBody(this.composeElement);
      if (!body) {
        console.warn('[PostMail][Pixel] Compose body not found, cannot inject');
        return false;
      }

      // Remove existing pixel(s) first
      this.removeFromDom();

      const pixel = document.createElement('img');
      pixel.src = trackingUrl;
      pixel.width = 1;
      pixel.height = 1;
      pixel.alt = '';
      pixel.setAttribute(TRACKING_PIXEL_ATTR, 'true');
      pixel.style.cssText = 'position:absolute;opacity:0;width:1px;height:1px;overflow:hidden;';

      body.appendChild(pixel);
      console.log(`[PostMail][Pixel] Injected tracking pixel: ${trackingUrl}`);
      return true;
    } catch (err) {
      console.warn('[PostMail][Pixel] Failed to inject tracking pixel:', err);
      return false;
    }
  }

  /** Remove the tracking pixel from the compose body. */
  remove(): void {
    this.removeFromDom();
  }

  /** Check whether a tracking pixel is currently present in the DOM. */
  isInjected(): boolean {
    return this.composeElement.querySelector(PIXEL_SELECTOR) !== null;
  }

  private removeFromDom(): void {
    const existing = this.composeElement.querySelectorAll(PIXEL_SELECTOR);
    if (existing.length > 0) {
      console.log(`[PostMail][Pixel] Removing ${existing.length} existing pixel(s)`);
    }
    existing.forEach((el) => el.remove());
  }
}
