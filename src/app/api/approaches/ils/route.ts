import { auth } from '@/auth';
import { isVatsimSession } from '@/lib/auth-policy';
import { airports } from '@/lib/data';
import { airportCharts } from '@/lib/charts';
import { matchApproachCharts } from '@/lib/chart-policy';
import { resolveIlsReference } from '@/lib/ils-service';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  if (!isVatsimSession(await auth())) return NextResponse.json({ error: 'VATSIM sign-in required.' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const airport = airports.find(value => value.id === params.get('airport')?.toUpperCase());
  const runway = params.get('runway')?.toUpperCase();
  if (!airport || !runway || !airport.runways.includes(runway)) return NextResponse.json({ error: 'Select a supported airport and runway.' }, { status: 400 });
  try {
    const charts = matchApproachCharts(await airportCharts(airport.id), runway, 'ILS');
    const result = await resolveIlsReference(airport.id, runway, charts);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Current ILS charts could not be retrieved. Please retry.' }, { status: 502 });
  }
}
