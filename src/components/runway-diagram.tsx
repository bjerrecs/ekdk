import sourceData from '@/lib/runway-data.json';
import taxiwayData from '@/lib/taxiway-data.json';
import { projectLayout } from '@/lib/runway-geometry';

export type GroundLayout = { info?: { label: string; lines: string[] }[]; source: { kind: 'chart' | 'osm'; name: string; publisher: string; derivation: string }; areas: { kind: 'taxiway' | 'apron'; rings: [number, number][][] }[]; lines?: { width: number; points: [number, number][] }[]; labels: { text: string; lat: number; lon: number }[] };

export function runwayLayout(icao: string) {
  return Object.entries(sourceData).find(([id]) => id === icao)?.[1];
}

export function groundLayout(icao: string) {
  return (taxiwayData as unknown as Record<string, GroundLayout | undefined>)[icao];
}

export default function RunwayDiagram({ icao, large = false, ground = false }: { icao: string; large?: boolean; ground?: boolean }) {
  const layout = runwayLayout(icao);
  if (!layout) return <div className="diagram-unavailable">Verified runway geometry unavailable.</div>;
  const taxiways = ground ? groundLayout(icao) : undefined;
  // Ground mode uses a wider frame so the taxiway layout fills the panel.
  const frame = taxiways ? { width: 400, height: 248, fitWidth: 372, fitHeight: 214, centerY: 124 } : { width: 255, height: 174, fitWidth: 195, fitHeight: 110, centerY: 88 };
  const { pairs, project, metresPerUnit } = projectLayout(layout.thresholds, [...(taxiways?.areas.flatMap(area => area.rings.flat()) || []), ...(taxiways?.lines?.flatMap(line => line.points) || [])], frame);
  const ringPath = (ring: [number, number][]) => ring.map((point, index) => `${index ? 'L' : 'M'}${project(point).map(value => value.toFixed(2)).join(' ')}`).join('') + 'Z';
  return <svg className={`${large ? 'airport-diagram large runway-diagram' : 'airport-diagram runway-diagram'}${taxiways ? ' ground-diagram' : ''}`} viewBox={`0 0 ${frame.width} ${frame.height}`} role="img" aria-label={`${icao} ${taxiways ? 'runway and taxiway' : 'runway threshold'} schematic derived from the Naviair aerodrome chart, North up. Not for navigation.`}>
    <title>{layout.source.publisher} · {layout.source.name} · {layout.source.derivation}{taxiways ? ` · Taxiways: ${taxiways.source.derivation}` : ''}</title>
    <g className="diagram-north" transform={taxiways ? "translate(-215 0)" : `translate(${frame.width - 255} 0)`}><text x="237" y="19" textAnchor="middle">N</text><path d="M237 25V39M233 30L237 25L241 30" fill="none" stroke="currentColor" strokeWidth="1.2" /></g>
    {taxiways && <g className="ground-pavement">{taxiways.areas.map((area, index) => <path key={index} className={`pavement-${area.kind}`} d={area.rings.map(ringPath).join('')} fillRule="evenodd" />)}{taxiways.lines?.map((line, index) => <path key={`line-${index}`} className="pavement-centreline" d={ringPath(line.points).slice(0, -1)} strokeWidth={Math.max(line.width / metresPerUnit, 0.8)} />)}</g>}
    {pairs.map(({ start, end }) => {
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      const vectorX = (end.x - start.x) / distance;
      const vectorY = (end.y - start.y) / distance;
      // Ground mode draws runways at true width so taxiway entries stay visible.
      const offset = taxiways ? 9 : 13;
      const width = taxiways ? Math.max(start.width / metresPerUnit, 1.2) : start.width >= 40 ? 7 : 5;
      return <g key={start.runway}><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#344658" strokeWidth={width} /><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#fff" strokeWidth={taxiways ? 0.3 : 0.8} strokeDasharray={taxiways ? '2 2' : '5 5'} /><text x={start.x - vectorX * offset} y={start.y - vectorY * offset} textAnchor="middle" dominantBaseline="central" className="runway-label">{start.runway}</text><text x={end.x + vectorX * offset} y={end.y + vectorY * offset} textAnchor="middle" dominantBaseline="central" className="runway-label">{end.runway}</text></g>;
    })}
    {taxiways && <g className="ground-labels">{taxiways.labels.map((label, index) => { const [x, y] = project([label.lat, label.lon]); return <text key={index} x={x} y={y} textAnchor="middle" dominantBaseline="central">{label.text}</text>; })}</g>}
    {!taxiways && <text className="diagram-source-label" x={frame.width / 2} y={frame.height - 11} textAnchor="middle">NAVIAIR ADC</text>}
  </svg>;
}
