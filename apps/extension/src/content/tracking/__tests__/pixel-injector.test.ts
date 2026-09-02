import { PixelInjector } from '../pixel-injector';
import { TRACKING_PIXEL_ATTR } from '@postmail/shared';

function createMockComposeWithBody(): { compose: HTMLElement; body: HTMLElement } {
  const compose = document.createElement('div');
  const body = document.createElement('div');
  body.setAttribute('role', 'textbox');
  body.setAttribute('g_editable', 'true');
  body.setAttribute('contenteditable', 'true');
  compose.appendChild(body);
  return { compose, body };
}

describe('PixelInjector', () => {
  it('injects a 1x1 hidden image into the compose body', () => {
    const { compose, body } = createMockComposeWithBody();
    const injector = new PixelInjector(compose);

    const result = injector.inject('https://track.example.com/o/test-token');

    expect(result).toBe(true);
    const img = body.querySelector('img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toBe('https://track.example.com/o/test-token');
    expect(img.width).toBe(1);
    expect(img.height).toBe(1);
    expect(img.alt).toBe('');
    expect(img.style.border).toBe('0px');
    expect(img.getAttribute(TRACKING_PIXEL_ATTR)).toBe('true');
  });

  it('reports injected status correctly', () => {
    const { compose } = createMockComposeWithBody();
    const injector = new PixelInjector(compose);

    expect(injector.isInjected()).toBe(false);

    injector.inject('https://track.example.com/o/test-token');

    expect(injector.isInjected()).toBe(true);
  });

  it('removes existing pixel before injecting a new one', () => {
    const { compose, body } = createMockComposeWithBody();
    const injector = new PixelInjector(compose);

    injector.inject('https://track.example.com/o/token-1');
    injector.inject('https://track.example.com/o/token-2');

    const imgs = body.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect((imgs[0] as HTMLImageElement).src).toBe('https://track.example.com/o/token-2');
  });

  it('does not inject duplicate pixels', () => {
    const { compose, body } = createMockComposeWithBody();
    const injector = new PixelInjector(compose);

    injector.inject('https://track.example.com/o/same-token');
    injector.inject('https://track.example.com/o/same-token');

    const imgs = body.querySelectorAll(`img[${TRACKING_PIXEL_ATTR}]`);
    expect(imgs).toHaveLength(1);
  });

  it('removes the pixel element from DOM', () => {
    const { compose, body } = createMockComposeWithBody();
    const injector = new PixelInjector(compose);

    injector.inject('https://track.example.com/o/test-token');
    expect(body.querySelector('img')).not.toBeNull();

    injector.remove();

    expect(body.querySelector('img')).toBeNull();
    expect(injector.isInjected()).toBe(false);
  });

  it('returns false when compose body cannot be found', () => {
    const compose = document.createElement('div'); // No body child
    const injector = new PixelInjector(compose);

    const result = injector.inject('https://track.example.com/o/test-token');

    expect(result).toBe(false);
    expect(injector.isInjected()).toBe(false);
  });

  it('does not affect other content in the compose body', () => {
    const { compose, body } = createMockComposeWithBody();
    body.innerHTML = '<p>Hello, this is my email content.</p>';
    const injector = new PixelInjector(compose);

    injector.inject('https://track.example.com/o/test-token');

    expect(body.querySelector('p')!.textContent).toBe('Hello, this is my email content.');
    expect(body.querySelectorAll('img')).toHaveLength(1);
  });
});
