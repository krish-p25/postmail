import contentDisposition from 'content-disposition';

/**
 * A raw `"` in the filename breaks the header's quoting, and a bare CR/LF makes
 * Node throw (500) when the header is set. The `content-disposition` package
 * handles quoting, and falls back to RFC 5987 `filename*` encoding for names
 * outside Latin-1.
 *
 * Only known-safe-to-render types are served inline; everything else forces a
 * download so the browser never executes it in the app's own origin. SVG is
 * deliberately excluded from the "images are safe" bucket below — unlike a
 * raster image, it can embed `<script>` and would run as this origin.
 */
const INLINE_SAFE_MIME_TYPES = new Set(['application/pdf']);
const INLINE_UNSAFE_IMAGE_TYPES = new Set(['image/svg+xml']);

export function attachmentContentDisposition(filename: string, mimeType: string): string {
  const isSafeImage = mimeType.startsWith('image/') && !INLINE_UNSAFE_IMAGE_TYPES.has(mimeType);
  const type = isSafeImage || INLINE_SAFE_MIME_TYPES.has(mimeType) ? 'inline' : 'attachment';
  return contentDisposition(filename || 'download', { type });
}
