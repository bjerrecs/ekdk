'use client';

import { useEffect, useState } from 'react';
import type { ChartDescriptor } from '@/lib/chart-types';

const cache = new Map<string, { charts: ChartDescriptor[]; timestamp: number }>();
const pending = new Map<string, Promise<ChartDescriptor[]>>();

async function fetchCharts(icao: string) {
  const cached = cache.get(icao);
  if (cached && Date.now() - cached.timestamp < 15 * 60_000) return cached.charts;
  if (pending.has(icao)) return pending.get(icao)!;
  const request = (async () => {
    const response = await fetch(`/api/charts?airport=${encodeURIComponent(icao)}`, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || !Array.isArray(result.charts)) throw new Error(result.error || 'The chart catalogue could not be loaded.');
    cache.set(icao, { charts: result.charts, timestamp: Date.now() });
    return result.charts as ChartDescriptor[];
  })();
  pending.set(icao, request);
  try { return await request; } finally { pending.delete(icao); }
}

export default function useCharts(icao?: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ icao?: string; charts: ChartDescriptor[]; loading: boolean; error: string }>({ charts: [], loading: Boolean(icao), error: '' });
  useEffect(() => {
    if (!icao) return;
    let cancelled = false;
    setState({ icao, charts: cache.get(icao)?.charts || [], loading: true, error: '' });
    fetchCharts(icao).then(charts => { if (!cancelled) setState({ icao, charts, loading: false, error: '' }); }).catch(error => { if (!cancelled) setState({ icao, charts: [], loading: false, error: error instanceof Error ? error.message : 'Naviair is unavailable.' }); });
    return () => { cancelled = true; };
  }, [icao, attempt]);
  return { charts: state.icao === icao ? state.charts : [], loading: Boolean(icao) && (state.icao !== icao || state.loading), error: state.icao === icao ? state.error : '', retry: () => { if (icao) cache.delete(icao); setAttempt(value => value + 1); } };
}
