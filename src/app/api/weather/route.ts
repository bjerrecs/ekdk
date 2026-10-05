import { auth } from '@/auth';
import { isVatsimSession } from '@/lib/auth-policy';
import { airports } from '@/lib/data';
import { parseMetar } from '@/lib/metar';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  if (!isVatsimSession(await auth())) return NextResponse.json({ error: 'VATSIM sign-in required.' }, { status: 401 });
  const airport = new URL(request.url).searchParams.get('airport')?.toUpperCase();
  if (!airports.some(value => value.id === airport)) return NextResponse.json({ error: 'Select a supported airport.' }, { status: 400 });
  try {
    const source = `https://metar.vatsim.net/${airport!.toLowerCase()}`;
    const response = await fetch(source, { signal: AbortSignal.timeout(10_000), next: { revalidate: 60 }, redirect: 'error' });
    if (!response.ok) throw new Error('METAR service unavailable');
    const report = parseMetar(await response.text(), airport);
    return NextResponse.json({ ...report, source, retrievedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'VATSIM METAR is unavailable. Retry or check the original report.' }, { status: 502 });
  }
}
