import sourceData from '@/lib/runway-data.json';
import taxiwayData from '@/lib/taxiway-data.json';
import { projectLayout } from '@/lib/runway-geometry';

export type GroundLayout = { info?: { label: string; lines: string[] }[]; source: { kind: 'chart' | 'osm'; name: string; publisher: string; derivation: string }; areas: { kind: 'taxiway' | 'apron'; rings: [number, number][][] }[]; lines?: { width: number; points: [number, number][] }[]; runways?: [number, number][][]; labels: { text: string; lat: number; lon: number }[] };

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
  // Ground mode sizes the frame to the airport's extent so tall layouts get height, not margins.
  const groundPoints = [...(taxiways?.areas.flatMap(area => area.rings.flat()) || []), ...(taxiways?.lines?.flatMap(line => line.points) || []), ...(taxiways?.runways?.flat() || [])];
  const groundHeight = taxiways ? Math.round(Math.min(Math.max(projectLayout(layout.thresholds, groundPoints).aspect * 360 + 56, 248), 580)) : 0;
  const frame = taxiways ? { width: 400, height: groundHeight, fitWidth: 360, fitHeight: groundHeight - 56, centerY: groundHeight / 2 } : { width: 255, height: 174, fitWidth: 195, fitHeight: 110, centerY: 88 };
  const { pairs, project, metresPerUnit } = projectLayout(layout.thresholds, groundPoints, frame);
  const runwayPoints = taxiways?.runways?.flat().map(point => project(point)) || [];
  // Ground layouts vary, so the north arrow takes the free corner with the least drawing near it
  // (top right is reserved for the Official ADC button, bottom left for the source label).
  const crowding = ([x, y]: [number, number]) => [...groundPoints.map(point => project(point)), ...runwayPoints, ...pairs.flatMap(({ start, end }) => [[start.x, start.y], [end.x, end.y]])].filter(([px, py]) => Math.hypot(px - x, py - (y + 29)) < 34).length;
  const northAt: [number, number] = taxiways ? ([[22, 0], [frame.width - 18, 34], [frame.width - 18, frame.height - 52]] as [number, number][]).reduce((best, corner) => crowding(corner) < crowding(best) ? corner : best) : [frame.width - 18, 0];
  const ringPath = (ring: [number, number][]) => ring.map((point, index) => `${index ? 'L' : 'M'}${project(point).map(value => value.toFixed(2)).join(' ')}`).join('') + 'Z';
  return <svg className={`${large ? 'airport-diagram large runway-diagram' : 'airport-diagram runway-diagram'}${taxiways ? ' ground-diagram' : ''}`} viewBox={`0 0 ${frame.width} ${frame.height}`} role="img" aria-label={`${icao} ${taxiways ? 'runway and taxiway' : 'runway threshold'} schematic derived from the Naviair aerodrome chart, North up. Not for navigation.`}>
    <title>{layout.source.publisher} · {layout.source.name} · {layout.source.derivation}{taxiways ? ` · Taxiways: ${taxiways.source.derivation}` : ''}</title>
    <g className="diagram-north" transform={`translate(${northAt[0] - 237} ${northAt[1]})`}><text x="237" y="19" textAnchor="middle">N</text><path d="M237 25V39M233 30L237 25L241 30" fill="none" stroke="currentColor" strokeWidth="1.2" /></g>
    {taxiways && <g className="ground-pavement">{taxiways.areas.map((area, index) => <path key={index} className={`pavement-${area.kind}`} d={area.rings.map(ringPath).join('')} fillRule="evenodd" />)}{taxiways.lines?.map((line, index) => <path key={`line-${index}`} className="pavement-centreline" d={ringPath(line.points).slice(0, -1)} strokeWidth={Math.max(line.width / metresPerUnit, 0.8)} />)}</g>}
    {taxiways?.runways && <path className="ground-runway" d={taxiways.runways.map(ringPath).join('')} fillRule="evenodd" />}
    {pairs.map(({ start, end }) => {
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      const vectorX = (end.x - start.x) / distance;
      const vectorY = (end.y - start.y) / distance;
      // Ground mode draws runways at true width so taxiway entries stay visible.
      // Designators sit beyond the drawn pavement, which can extend past a displaced threshold.
      const along = runwayPoints.filter(([x, y]) => Math.abs(-(x - start.x) * vectorY + (y - start.y) * vectorX) < 4).map(([x, y]) => (x - start.x) * vectorX + (y - start.y) * vectorY);
      const startOffset = Math.max(taxiways ? 9 : 13, along.length ? -Math.min(...along) + 7 : 0);
      const endOffset = Math.max(taxiways ? 9 : 13, along.length ? Math.max(...along) - distance + 7 : 0);
      const width = taxiways ? Math.max(start.width / metresPerUnit, 1.2) : start.width >= 40 ? 7 : 5;
      return <g key={start.runway}>{!taxiways?.runways && <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#344658" strokeWidth={width} />}<line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#fff" strokeWidth={taxiways ? 0.3 : 0.8} strokeDasharray={taxiways ? '2 2' : '5 5'} /><text x={start.x - vectorX * startOffset} y={start.y - vectorY * startOffset} textAnchor="middle" dominantBaseline="central" className="runway-label">{start.runway}</text><text x={end.x + vectorX * endOffset} y={end.y + vectorY * endOffset} textAnchor="middle" dominantBaseline="central" className="runway-label">{end.runway}</text></g>;
    })}
    {taxiways && <g className="ground-labels">{taxiways.labels.map((label, index) => { const [x, y] = project([label.lat, label.lon]); return <text key={index} x={x} y={y} textAnchor="middle" dominantBaseline="central">{label.text}</text>; })}</g>}
    {!taxiways && <text className="diagram-source-label" x={frame.width / 2} y={frame.height - 11} textAnchor="middle">NAVIAIR ADC</text>}
  </svg>;
}
