'use client';

import { useEffect, useState } from 'react';
import { Navigation, Radio, Plane, Target, RefreshCw, FileText } from 'lucide-react';
import type { ChartDescriptor } from '@/lib/chart-types';

type Values = { course: string | null; frequency: string | null; identifier: string | null };
type Variant = Values & { chart: ChartDescriptor; issue: string | null; kind?: string };
type Reference = Values & { variants: Variant[]; conflicts: string[]; checkedAt: string };

export default function ApproachQuickReference({ airport, runway, procedure, length, openChart }: { airport: string; runway: string; procedure: string; length?: number; openChart: (chart: ChartDescriptor) => void }) {
  const [reference, setReference] = useState<Reference | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(procedure === 'ILS');
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState('');
  useEffect(() => {
    if (procedure !== 'ILS') return;
    let cancelled = false;
    let controller: AbortController;
    async function refresh() {
      controller?.abort();
      controller = new AbortController();
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/approaches/ils?airport=${airport}&runway=${runway}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'The ILS reference could not be loaded.');
        if (!cancelled) setReference(result);
      } catch (failure) {
        if (!cancelled) { setReference(null); setError(failure instanceof Error ? failure.message : 'ILS extraction failed.'); }
      } finally { if (!cancelled) setLoading(false); }
    }
    void refresh();
    const interval = setInterval(refresh, 15 * 60_000);
    return () => { cancelled = true; controller?.abort(); clearInterval(interval); };
  }, [airport, runway, procedure, attempt]);
  const variants = reference?.variants.filter(variant => variant.kind !== 'supplement') || [];
  const selectedVariant = variants.find(variant => variant.chart.name === selected);
  const values = selected ? selectedVariant : reference;
  const source = selectedVariant?.chart || variants.find(variant => !variant.issue)?.chart;
  const status = loading ? 'Reading current chart…' : error ? error : !reference?.variants.length ? 'No current ILS chart is published for this runway.' : selectedVariant?.issue || (reference.conflicts.length && !selected ? 'Chart variants disagree. Select a chart to see its published values.' : variants.some(variant => variant.issue) && !selected ? 'Some chart values are unavailable. Select a readable chart or open the original source.' : 'Automatically extracted from the current Naviair approach chart. Course is magnetic.');
  return <><div className="quick-values">{[
    { label: 'Approach course', unit: '°', icon: Navigation, value: values?.course, source: 'NAVIAIR ILS chart' },
    { label: procedure === 'ILS' ? 'ILS frequency' : 'Frequency', unit: 'MHz', icon: Radio, value: values?.frequency, source: 'NAVIAIR ILS chart' },
    { label: 'Runway length', unit: 'm', icon: Plane, value: length?.toLocaleString(), source: 'NAVIAIR AIP AD 2' },
    { label: 'Identifier', unit: '', icon: Target, value: values?.identifier, source: 'NAVIAIR ILS chart' },
  ].map(({ label, unit, icon: Icon, value, source: publisher }) => <div key={label}><div><Icon size={25} /><span>{label}</span></div><strong>{value || '—'} {unit}</strong><small>{value ? publisher : loading ? 'Loading' : 'Not available'}</small></div>)}</div>
    {procedure === 'ILS' && <div className="ils-reference-status"><p role={error ? 'alert' : 'status'}>{status}</p><div className="ils-reference-actions">{variants.length > 1 && <label>Chart variant<select value={selected} onChange={event => setSelected(event.target.value)}><option value="">All applicable charts</option>{variants.map(variant => <option value={variant.chart.name} key={variant.chart.name}>{variant.chart.title}</option>)}</select></label>}{source && <button className="secondary" onClick={() => openChart(source)}><FileText size={16} />Open source chart</button>}<button className="secondary" disabled={loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} />Refresh reference</button></div></div>}
  </>;
}
