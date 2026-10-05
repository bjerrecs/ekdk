'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { FileText, Info, RefreshCw } from 'lucide-react';

function PdfPage({ document, pageNumber, width, rotation }: { document: PDFDocumentProxy; pageNumber: number; width: number; rotation: number }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('0.707');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting), { root: container.current.closest('.chart-viewport'), rootMargin: '500px' });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    let render: { cancel: () => void; promise: Promise<unknown> } | undefined;
    async function draw() {
      const page = await document.getPage(pageNumber);
      const natural = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 });
      if (cancelled) return;
      setAspectRatio(String(natural.width / natural.height));
      if (!visible || !canvas.current || width <= 0) return;
      const resolution = Math.min(window.devicePixelRatio || 1, 1.5, 2048 / width);
      const viewport = page.getViewport({ scale: width * resolution / natural.width, rotation: (page.rotate + rotation) % 360 });
      const context = canvas.current.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');
      canvas.current.width = Math.ceil(viewport.width);
      canvas.current.height = Math.ceil(viewport.height);
      setFailed(false);
      render = page.render({ canvas: canvas.current, canvasContext: context, viewport });
      await render.promise;
    }
    draw().catch(error => { if (!cancelled && error?.name !== 'RenderingCancelledException') setFailed(true); });
    return () => { cancelled = true; render?.cancel(); };
  }, [document, pageNumber, width, rotation, visible]);
  return <div ref={container} className="pdf-page" style={{ aspectRatio }}><canvas ref={canvas} role="img" aria-label={`Official Naviair chart, page ${pageNumber} of ${document.numPages}`} />{failed && <div className="pdf-page-error"><Info size={20} />This page could not be rendered. Open the original source.</div>}<span className="pdf-page-number">{pageNumber} / {document.numPages}</span></div>;
}

export default function PdfDocument({ icao, name, rotation }: { icao: string; name: string; rotation: number }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | undefined;
    setDocument(null);
    setError('');
    async function load() {
      const pdfjs = await import('pdfjs-dist');
      if (cancelled) return;
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      const loading = pdfjs.getDocument({ url: `/api/charts/file?airport=${encodeURIComponent(icao)}&name=${encodeURIComponent(name)}`, withCredentials: true, enableXfa: false, standardFontDataUrl: '/pdfjs/standard_fonts/', cMapUrl: '/pdfjs/cmaps/', cMapPacked: true });
      task = loading;
      const loaded = await loading.promise;
      if (!cancelled) setDocument(loaded);
    }
    load().catch(() => { if (!cancelled) setError('This PDF could not be loaded. Your session may have expired or Naviair may be unavailable. Retry or open the original source.'); });
    return () => { cancelled = true; void task?.destroy(); };
  }, [icao, name, attempt]);
  return <div className="pdf-document" ref={container}>{error ? <div className="pdf-loading" role="alert"><Info size={30} /><p>{error}</p><button className="secondary" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} />Retry document</button><a className="text-link" href="/login">Check VATSIM sign-in</a></div> : document ? Array.from({ length: document.numPages }, (_, index) => <PdfPage key={index + 1} document={document} pageNumber={index + 1} width={width} rotation={rotation} />) : <div className="pdf-loading" role="status"><FileText size={32} /><p>Loading official Naviair chart…</p></div>}</div>;
}
