import { auth } from '@/auth';
import { isVatsimSession } from '@/lib/auth-policy';
import { airports } from '@/lib/data';
import { airportCharts } from '@/lib/charts';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  if (!isVatsimSession(await auth())) return NextResponse.json({ error: 'VATSIM sign-in required.' }, { status: 401 });
  const icao = new URL(request.url).searchParams.get('airport')?.toUpperCase();
  if (!airports.some(airport => airport.id === icao)) return NextResponse.json({ error: 'Select a supported airport.' }, { status: 400 });
  try {
    const charts = await airportCharts(icao!);
    return NextResponse.json({ charts, publisher: 'NAVIAIR · AIP Denmark', resolvedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Naviair is unavailable. Please retry or open the official source portal.' }, { status: 502 });
  }
}
