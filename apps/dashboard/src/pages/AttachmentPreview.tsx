import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { auth } from '../services/auth';

function getFileCategory(mime: string, filename: string) {
  const ext = filename?.split('.').pop()?.toLowerCase() || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (
    mime.startsWith('text/') ||
    ['application/json', 'application/xml', 'application/javascript'].includes(mime) ||
    ['json', 'xml', 'csv', 'md', 'txt', 'log', 'yml', 'yaml', 'ini', 'cfg', 'conf', 'sh', 'env'].includes(ext)
  )
    return 'text';
  if (
    ext === 'docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return 'docx';
  return 'unsupported';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AttachmentPreview() {
  const [params] = useSearchParams();
  const provider = params.get('provider') || 'gmail';
  const messageId = params.get('messageId') || '';
  const attachmentId = params.get('attachmentId') || '';
  const filename = params.get('filename') || 'download';
  const mime = params.get('mime') || 'application/octet-stream';
  const size = Number(params.get('size') || 0);

  const category = getFileCategory(mime, filename);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const blobRef = useRef<Blob | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    document.title = filename;
  }, [filename]);

  useEffect(() => {
    if (!messageId || !attachmentId) {
      setError('Missing attachment parameters');
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function load() {
      if (category === 'unsupported') {
        setLoading(false);
        return;
      }
      try {
        const apiBase = import.meta.env.VITE_API_URL || 'https://api.postmail.krishrp.xyz';
        const route = provider === 'outlook' ? 'outlook' : 'gmail';
        const url = `${apiBase}/${route}/emails/${messageId}/attachments/${attachmentId}`;
        const token = auth.getToken();
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Failed to load file');

        if (category === 'text') {
          setTextContent(await res.text());
        } else if (category === 'docx') {
          const arrayBuffer = await res.arrayBuffer();
          blobRef.current = new Blob([arrayBuffer], { type: mime });
          const mammoth = await import('mammoth');
          const result = await mammoth.convertToHtml({ arrayBuffer });
          setDocxHtml(result.value);
        } else {
          const data = await res.arrayBuffer();
          const contentType = res.headers.get('Content-Type') || mime;
          const blob = new Blob([data], { type: contentType });
          blobRef.current = blob;
          const objUrl = URL.createObjectURL(blob);
          blobUrlRef.current = objUrl;
          setBlobUrl(objUrl);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to load preview');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => {
      controller.abort();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, [messageId, attachmentId, provider, category, mime]);

  async function handleDownload() {
    setDownloading(true);
    try {
      if (blobRef.current) {
        triggerDownload(blobRef.current, filename);
      } else if (textContent !== null) {
        triggerDownload(new Blob([textContent], { type: mime }), filename);
      } else {
        const apiBase = import.meta.env.VITE_API_URL || 'https://api.postmail.krishrp.xyz';
        const route = provider === 'outlook' ? 'outlook' : 'gmail';
        const url = `${apiBase}/${route}/emails/${messageId}/attachments/${attachmentId}`;
        const token = auth.getToken();
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error('Download failed');
        const data = await res.arrayBuffer();
        triggerDownload(
          new Blob([data], { type: res.headers.get('Content-Type') || mime }),
          filename,
        );
      }
    } catch {
      // silently fail
    } finally {
      setDownloading(false);
    }
  }

  function renderContent() {
    if (loading) {
      return (
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-600" />
          <p className="text-sm text-gray-500">Loading preview…</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-red-50 p-8">
          <svg className="h-10 w-10 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      );
    }

    if (category === 'unsupported') {
      return (
        <div className="flex flex-col items-center gap-4 rounded-xl bg-gray-50 p-10">
          <svg className="h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <div className="text-center">
            <p className="text-base font-medium text-gray-900">Preview not available</p>
            <p className="mt-1 text-sm text-gray-500">
              This file type cannot be previewed. Download it to view on your device.
            </p>
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download
          </button>
        </div>
      );
    }

    if (category === 'image' && blobUrl) {
      return <img src={blobUrl} alt={filename} className="max-h-[calc(100vh-8rem)] max-w-full rounded object-contain" />;
    }

    if (category === 'pdf' && blobUrl) {
      return <iframe src={blobUrl} title={filename} className="h-[calc(100vh-5rem)] w-full rounded border border-gray-200" />;
    }

    if (category === 'video' && blobUrl) {
      return <video src={blobUrl} controls className="max-h-[calc(100vh-8rem)] max-w-full rounded" />;
    }

    if (category === 'audio' && blobUrl) {
      return (
        <div className="flex flex-col items-center gap-4 rounded-xl bg-gray-50 p-10">
          <svg className="h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
          </svg>
          <p className="text-sm font-medium text-gray-900">{filename}</p>
          <audio src={blobUrl} controls className="w-full max-w-md" />
        </div>
      );
    }

    if (category === 'text' && textContent !== null) {
      return (
        <div className="w-full max-w-4xl overflow-auto rounded-lg border border-gray-200 bg-white p-6">
          <pre className="whitespace-pre-wrap break-words font-mono text-sm text-gray-800">{textContent}</pre>
        </div>
      );
    }

    if (category === 'docx' && docxHtml !== null) {
      return (
        <div className="w-full max-w-4xl overflow-auto rounded-lg border border-gray-200 bg-white p-8">
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: docxHtml }}
          />
        </div>
      );
    }

    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <span className="truncate text-sm font-medium text-gray-900">{filename}</span>
          <span className="shrink-0 text-xs text-gray-400">{formatFileSize(size)}</span>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          title="Download"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          <span className="hidden sm:inline">Download</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-4 sm:p-8">
        {renderContent()}
      </div>
    </div>
  );
}
