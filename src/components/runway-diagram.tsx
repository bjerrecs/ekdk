import sourceData from '@/lib/runway-data.json';
import { projectRunways } from '@/lib/runway-geometry';

export function runwayLayout(icao: string) {
  return Object.entries(sourceData).find(([id]) => id === icao)?.[1];
}

export default function RunwayDiagram({ icao, large = false }: { icao: string; large?: boolean }) {
  const layout = runwayLayout(icao);
  if (!layout) return <div className="diagram-unavailable">Verified runway geometry unavailable.</div>;
  const pairs = projectRunways(layout.thresholds);
  return <svg className={large ? 'airport-diagram large runway-diagram' : 'airport-diagram runway-diagram'} viewBox="0 0 255 174" role="img" aria-label={`${icao} runway threshold schematic derived from the Naviair aerodrome chart, North up. Not for navigation.`}>
    <title>{layout.source.publisher} · {layout.source.name} · {layout.source.derivation}</title>
    <g className="diagram-north"><text x="237" y="19" textAnchor="middle">N</text><path d="M237 25V39M233 30L237 25L241 30" fill="none" stroke="currentColor" strokeWidth="1.2" /></g>
    {pairs.map(({ start, end }) => {
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      const vectorX = (end.x - start.x) / distance;
      const vectorY = (end.y - start.y) / distance;
      return <g key={start.runway}><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#344658" strokeWidth={start.width >= 40 ? 7 : 5} /><line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#fff" strokeWidth=".8" strokeDasharray="5 5" /><text x={start.x - vectorX * 13} y={start.y - vectorY * 13} textAnchor="middle" dominantBaseline="central">{start.runway}</text><text x={end.x + vectorX * 13} y={end.y + vectorY * 13} textAnchor="middle" dominantBaseline="central">{end.runway}</text></g>;
    })}
    <text className="diagram-source-label" x="127.5" y="163" textAnchor="middle">NAVIAIR ADC</text>
  </svg>;
}
