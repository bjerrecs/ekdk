import { auth } from '@/auth';
import { isVatsimSession } from '@/lib/auth-policy';
import { isNaviairPdfUrl } from '@/lib/chart-policy';
import { airports } from '@/lib/data';
import { airportCharts } from '@/lib/charts';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
const maxPdfBytes = 25 * 1024 * 1024;

export async function GET(request: Request) {
  if (!isVatsimSession(await auth())) return NextResponse.json({ error: 'VATSIM sign-in required.' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const icao = params.get('airport')?.toUpperCase();
  const name = params.get('name');
  if (!airports.some(airport => airport.id === icao) || !name || name.length > 200) return NextResponse.json({ error: 'Invalid chart request.' }, { status: 400 });
  try {
    const chart = (await airportCharts(icao!)).find(value => value.name === name);
    if (!chart || !isNaviairPdfUrl(chart.url)) return NextResponse.json({ error: 'This chart is not in the current airport catalogue.' }, { status: 404 });
    const upstream = await fetch(chart.url, { redirect: 'error', signal: AbortSignal.timeout(25_000), cache: 'no-store' });
    if (!upstream.ok || !upstream.body) throw new Error('Chart download failed');
    if (Number(upstream.headers.get('content-length')) > maxPdfBytes) return NextResponse.json({ error: 'The document exceeds the viewer size limit.' }, { status: 413 });
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxPdfBytes) { await reader.cancel(); return NextResponse.json({ error: 'The document exceeds the viewer size limit.' }, { status: 413 }); }
      chunks.push(value);
    }
    const buffer = Buffer.concat(chunks, length);
    if (buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid chart format');
    return new Response(buffer, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${chart.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return NextResponse.json({ error: 'The chart could not be downloaded from Naviair. Please retry or open the original source.' }, { status: 502 });
  }
}
