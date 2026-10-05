import { auth } from '@/auth';
import { isVatsimSession } from '@/lib/auth-policy';
import { airports } from '@/lib/data';
import { selectRunways } from '@/lib/runway-selection';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ATIS_FEED = 'https://data.vatsim.net/v3/afv-atis-data.json';
let atisCache: { entries: unknown[]; timestamp: number } | null = null;

async function atisEntries() {
  if (atisCache && Date.now() - atisCache.timestamp < 30_000) return atisCache.entries;
  const response = await fetch(ATIS_FEED, { signal: AbortSignal.timeout(10_000), cache: 'no-store', redirect: 'error' });
  if (!response.ok) throw new Error('VATSIM ATIS feed unavailable');
  const entries = await response.json();
  if (!Array.isArray(entries)) throw new Error('Unexpected VATSIM ATIS feed');
  atisCache = { entries, timestamp: Date.now() };
  return entries;
}

async function metar(airport: string) {
  const response = await fetch(`https://metar.vatsim.net/${airport.toLowerCase()}`, { signal: AbortSignal.timeout(10_000), next: { revalidate: 60 }, redirect: 'error' });
  if (!response.ok) throw new Error('METAR service unavailable');
  return response.text();
}

export async function GET(request: Request) {
  if (!isVatsimSession(await auth())) return NextResponse.json({ error: 'VATSIM sign-in required.' }, { status: 401 });
  const airport = new URL(request.url).searchParams.get('airport')?.toUpperCase();
  if (!airports.some(value => value.id === airport)) return NextResponse.json({ error: 'Select a supported airport.' }, { status: 400 });
  // Either source may fail on its own; the selection falls through to the next priority.
  const [atis, report] = await Promise.allSettled([atisEntries(), metar(airport!)]);
  const result = selectRunways({ airport, atis: atis.status === 'fulfilled' ? atis.value : [], metar: report.status === 'fulfilled' ? report.value : '' });
  return NextResponse.json({ airport, ...result, atisUnavailable: atis.status === 'rejected', retrievedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'private, no-store' } });
}
