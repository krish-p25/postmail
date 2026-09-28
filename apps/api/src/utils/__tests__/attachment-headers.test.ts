import { attachmentContentDisposition } from '../attachment-headers';

it('quotes a filename containing a double quote instead of breaking the header', () => {
  const header = attachmentContentDisposition('evil".pdf', 'application/pdf');
  expect(header).toBe('inline; filename="evil\\".pdf"');
});

it('never lets a filename inject a CR/LF into the header value', () => {
  const header = attachmentContentDisposition('name\r\nX-Injected: yes.txt', 'text/plain');
  expect(header).not.toMatch(/[\r\n]/);
});

it('serves images and PDFs inline', () => {
  expect(attachmentContentDisposition('photo.png', 'image/png')).toMatch(/^inline;/);
  expect(attachmentContentDisposition('doc.pdf', 'application/pdf')).toMatch(/^inline;/);
});

it('forces a download for anything else, including HTML/SVG that could execute in the app origin', () => {
  expect(attachmentContentDisposition('page.html', 'text/html')).toMatch(/^attachment;/);
  expect(attachmentContentDisposition('vector.svg', 'image/svg+xml')).toMatch(/^attachment;/);
});

it('falls back to a default name when none is given', () => {
  expect(attachmentContentDisposition('', 'application/octet-stream')).toBe('attachment; filename="download"');
});

it('adds an RFC 5987 filename* fallback for a name outside Latin-1', () => {
  const header = attachmentContentDisposition('日本語.pdf', 'application/pdf');
  expect(header).toMatch(/filename\*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E\.pdf/);
});
