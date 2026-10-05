'use client';

import { useEffect, useState } from 'react';
import { Cloud, Gauge, RefreshCw, Target, Thermometer, Wind } from 'lucide-react';
import { observationAge } from '@/lib/metar';

type Report = { airport: string; raw: string; observedAt: string | null; wind: string; qnh: string; visibility: string; cloud: string; temperature: string; dewPoint: string; source: string };
const cache = new Map<string, Report>();
const pending = new Map<string, Promise<Report>>();
async function loadReport(airport: string) {
  if (pending.has(airport)) return pending.get(airport)!;
  const request = (async () => {
    const response = await fetch(`/api/weather?airport=${airport}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    const report = await response.json();
    if (!response.ok) throw new Error(report.error || 'METAR could not be loaded.');
    cache.set(airport, report);
    return report as Report;
  })();
  pending.set(airport, request);
  try { return await request; } finally { pending.delete(airport); }
}
function useWeather(airport: string) {
  const [state, setState] = useState<{ airport: string; report?: Report; error: string; loading: boolean }>({ airport, report: cache.get(airport), error: '', loading: true });
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      setState(previous => ({ airport, report: previous.airport === airport ? previous.report : cache.get(airport), error: '', loading: true }));
      loadReport(airport).then(report => { if (!cancelled) setState({ airport, report, error: '', loading: false }); }).catch(error => { if (!cancelled) setState(previous => ({ ...previous, error: error.message, loading: false })); });
      setNow(Date.now());
    };
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [airport, attempt]);
  const report = state.airport === airport ? state.report : undefined;
  return { report, error: state.airport === airport ? state.error : '', loading: state.loading, age: observationAge(report?.observedAt, now), stale: !!report?.observedAt && now - Date.parse(report.observedAt) > 90 * 60_000, retry: () => setAttempt(value => value + 1) };
}
export function MiniWeather({ airport }: { airport: { id: string } }) {
  const { report, error, loading, age, stale } = useWeather(airport.id);
  return <div className="airport-mini-weather"><div><span>WIND</span><strong>{report?.wind || '—'}</strong></div><div><span>QNH</span><strong>{report?.qnh || '—'}</strong></div><div className="data-age"><span>DATA AGE</span><small title={error || 'Source: VATSIM METAR'} className={stale || error ? 'weather-stale' : ''}>{error ? report ? `${age} · cached` : 'Unavailable' : report ? `${age}${stale ? ' · stale' : ''}` : loading ? 'Loading' : 'Unavailable'}</small></div></div>;
}
export function WeatherSummary({ airport }: { airport: string }) {
  const { report, error, age } = useWeather(airport);
  return <dl className="detail-list"><div><dt>Wind</dt><dd>{report?.wind || '—'}</dd></div><div><dt>QNH</dt><dd>{report?.qnh || '—'}</dd></div><div><dt>Observation age</dt><dd>{report ? `${age}${error ? ' · cached' : ''}` : 'Unavailable'}</dd></div><div><dt>Source</dt><dd>VATSIM METAR</dd></div></dl>;
}
export function WeatherReport({ airport }: { airport: string }) {
  const { report, error, loading, age, stale, retry } = useWeather(airport);
  return <><section className="panel"><div className="panel-heading"><Cloud size={22} /><h2>METAR observation</h2><button className="secondary" disabled={loading} onClick={retry}><RefreshCw size={16} />Refresh</button></div><div className="panel-body"><div className="weather-source">Age: {age}{stale && ' · stale'}{error && report && ' · cached'}<span>Source: VATSIM METAR</span></div>{report?.observedAt && <p className="muted">Observed {new Date(report.observedAt).toUTCString()}</p>}<div className="raw-weather">{report?.raw || (loading ? 'Loading VATSIM METAR…' : 'No observation available.')}</div>{error && <p role="alert" className="weather-error">{error}</p>}<a className="text-link" href={`https://metar.vatsim.net/${airport.toLowerCase()}`} target="_blank" rel="noreferrer">Open original METAR</a></div></section><section className="panel"><div className="panel-heading"><h2>Decoded observation</h2></div><div className="panel-body"><div className="decoded-grid">{[{ label: 'Wind', icon: Wind, value: report?.wind }, { label: 'Visibility', icon: Target, value: report?.visibility }, { label: 'Cloud', icon: Cloud, value: report?.cloud }, { label: 'QNH', icon: Gauge, value: report?.qnh }, { label: 'Temperature', icon: Thermometer, value: report?.temperature }, { label: 'Dew point', icon: Thermometer, value: report?.dewPoint }].map(({ label, icon: Icon, value }) => <div key={label}><Icon size={28} /><div><span>{label}</span><strong>{value || '—'}</strong></div></div>)}</div><p className="muted">Decoded from the observation portion only. Consult the raw METAR for trends and additional groups. TAF is not supplied by this service.</p></div></section></>;
}
