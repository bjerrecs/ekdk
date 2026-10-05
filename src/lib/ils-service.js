import { isNaviairPdfUrl } from './chart-policy.js';
import { extractIlsReference, combineIlsReferences } from './ils-parser.js';

const cache = new Map();
const pending = new Map();
const lifetime = 15 * 60_000;

async function readChart(chart, airport, runway) {
  if (!isNaviairPdfUrl(chart.url)) throw new Error('Invalid chart source');
  const response = await fetch(chart.url, { redirect: 'error', signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  if (!response.ok || !response.body) throw new Error('Chart download failed');
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('Chart exceeds extraction size limit'); }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, stopAtErrors: true });
  try {
    const document = await task.promise;
    if (document.numPages !== 1) throw new Error('Unrecognized multipage approach chart');
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const items = content.items.filter(item => 'str' in item).map(item => ({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width }));
    return { ...extractIlsReference(items, { airport, runway, height: page.view[3] - page.view[1] }), chart };
  } finally { await task.destroy(); }
}

export async function resolveIlsReference(airport, runway, charts) {
  const key = `${airport}:${runway}:${charts.map(chart => `${chart.url}:${chart.effective}`).sort().join('|')}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < lifetime) return cached.result;
  if (pending.has(key)) return pending.get(key);
  const request = (async () => {
    if (charts.length > 12) throw new Error('Too many applicable charts');
    const variants = [];
    for (let index = 0; index < charts.length; index += 3) {
      const batch = await Promise.all(charts.slice(index, index + 3).map(async chart => {
        try { return await readChart(chart, airport, runway); }
        catch { return { course: null, frequency: null, identifier: null, issue: 'This chart could not be read. Open the source or retry.', chart }; }
      }));
      variants.push(...batch);
    }
    const result = { airport, runway, ...combineIlsReferences(variants), variants, checkedAt: new Date().toISOString() };
    if (!variants.some(variant => variant.issue)) {
      for (const [entry, value] of cache) if (Date.now() - value.timestamp >= lifetime) cache.delete(entry);
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, { timestamp: Date.now(), result });
    }
    return result;
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}
