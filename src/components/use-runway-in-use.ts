'use client';

import { useEffect, useState } from 'react';

export type RunwayInUse = { airport: string; arrival: string | null; departure: string | null; source: { kind: 'atis' | 'wind' | 'preferred' | 'unavailable'; label: string; detail: string }; atisUnavailable: boolean; retrievedAt: string };

const cache = new Map<string, RunwayInUse>();
export const cachedRunwayInUse = (icao: string) => cache.get(icao);

async function fetchRunwayInUse(icao: string) {
  const response = await fetch(`/api/runways?airport=${encodeURIComponent(icao)}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Runway in use could not be determined.');
  cache.set(icao, result);
  return result as RunwayInUse;
}

export default function useRunwayInUse(icao?: string) {
  const [state, setState] = useState<{ icao?: string; data?: RunwayInUse; error: string }>({ error: '' });
  useEffect(() => {
    if (!icao) return;
    let cancelled = false;
    const refresh = () => fetchRunwayInUse(icao).then(data => { if (!cancelled) setState({ icao, data, error: '' }); }).catch(error => { if (!cancelled) setState(previous => ({ icao, data: previous.icao === icao ? previous.data : undefined, error: error instanceof Error ? error.message : 'Runway in use is unavailable.' })); });
    setState({ icao, data: cache.get(icao), error: '' });
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [icao]);
  return state.icao === icao ? { data: state.data, error: state.error } : { data: icao ? cache.get(icao) : undefined, error: '' };
}
