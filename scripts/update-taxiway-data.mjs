// Regenerates src/lib/taxiway-data.json for the given airports (default: all configured).
// Hybrid sources: 'chart' extracts pavement from the official Naviair ADC vector artwork and
// georeferences it on the published runway thresholds; other airports use OpenStreetMap.
// Review every regenerated airport against the official ADC before release.
import { readFile, writeFile } from 'node:fs/promises';
import { readChart } from './lib/adc-vector.mjs';
import { coordinateToDecimal, reciprocalRunway } from '../src/lib/runway-geometry.js';

// --osm forces OpenStreetMap (to cross-check a chart-derived airport); TAXIWAY_OUTPUT redirects the file.
const output = process.env.TAXIWAY_OUTPUT || 'src/lib/taxiway-data.json';
const runwayData = JSON.parse(await readFile('src/lib/runway-data.json', 'utf8'));
const existing = JSON.parse(await readFile(output, 'utf8').catch(() => '{}'));

// Pavement fill colours differ per chart; each entry is checked visually against its ADC.
const sources = {
  EKYT: { kind: 'chart', taxiway: ['#969696'], apron: ['#d2d2d2'] },
};

const METRES_PER_DEGREE = 111_320;
const LABEL = /^[A-Z]{1,2}\d{0,2}$/;

function localFrame(thresholds) {
  const points = thresholds.map(value => [coordinateToDecimal(value.latitude), coordinateToDecimal(value.longitude)]);
  const latitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const longitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const cos = Math.cos(latitude * Math.PI / 180);
  return {
    toLocal: ([lat, lon]) => [(lon - longitude) * cos * METRES_PER_DEGREE, (lat - latitude) * METRES_PER_DEGREE],
    toGeo: ([east, north]) => [latitude + north / METRES_PER_DEGREE, longitude + east / (cos * METRES_PER_DEGREE)],
  };
}

function principal(points) {
  const n = points.length;
  const cx = points.reduce((sum, p) => sum + p[0], 0) / n, cy = points.reduce((sum, p) => sum + p[1], 0) / n;
  let xx = 0, yy = 0, xy = 0;
  for (const [x, y] of points) { xx += (x - cx) ** 2; yy += (y - cy) ** 2; xy += (x - cx) * (y - cy); }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy), ux = Math.cos(angle), uy = Math.sin(angle);
  const along = points.map(([x, y]) => (x - cx) * ux + (y - cy) * uy), across = points.map(([x, y]) => -(x - cx) * uy + (y - cy) * ux);
  const min = Math.min(...along), max = Math.max(...along);
  return { length: max - min, width: Math.max(...across) - Math.min(...across), ends: [[cx + ux * min, cy + uy * min], [cx + ux * max, cy + uy * max]] };
}

// Least-squares similarity (scale, rotation, translation) from page space (y down) to local metres.
function fitSimilarity(pairs) {
  const z = pairs.map(([[x, y]]) => [x, -y]), w = pairs.map(([, target]) => target);
  const mean = list => [list.reduce((s, p) => s + p[0], 0) / list.length, list.reduce((s, p) => s + p[1], 0) / list.length];
  const [zx, zy] = mean(z), [wx, wy] = mean(w);
  let re = 0, im = 0, norm = 0;
  z.forEach(([x, y], index) => { const dx = x - zx, dy = y - zy, ex = w[index][0] - wx, ey = w[index][1] - wy; re += ex * dx + ey * dy; im += ey * dx - ex * dy; norm += dx * dx + dy * dy; });
  const a = re / norm, b = im / norm;
  const map = ([x, y]) => { const dx = x - zx, dy = -y - zy; return [wx + a * dx - b * dy, wy + b * dx + a * dy]; };
  const residual = Math.max(...pairs.map(([source, target]) => Math.hypot(map(source)[0] - target[0], map(source)[1] - target[1])));
  return { map, residual, metresPerPoint: Math.hypot(a, b), rotation: Math.atan2(b, a) * 180 / Math.PI };
}

function georeference(chart, thresholds, frame) {
  const runways = [];
  for (const start of thresholds) {
    const end = thresholds.find(value => value.runway === reciprocalRunway(start.runway));
    if (end && start.runway < end.runway) runways.push({ start, end, length: Math.hypot(...frame.toLocal([coordinateToDecimal(end.latitude), coordinateToDecimal(end.longitude)]).map((value, axis) => value - frame.toLocal([coordinateToDecimal(start.latitude), coordinateToDecimal(start.longitude)])[axis])) });
  }
  const shapes = chart.paths.filter(path => path.filled && path.fill === '#000000').flatMap(path => path.subpaths.map(principal)).filter(shape => shape.length > 60 && shape.length / Math.max(shape.width, 0.1) > 12);
  let best = null;
  // Runways and chart rectangles are paired by length rank; both end orders are tried and
  // the fit must keep the chart within 90° of north-up to rule out the mirrored solution.
  const byLength = (x, y) => y.length - x.length;
  const ranked = shapes.slice().sort(byLength);
  const matched = runways.slice().sort(byLength).map((runway, index) => ({ runway, shape: ranked[index] }));
  if (matched.some(value => !value.shape)) throw new Error('Not every runway was found on the chart');
  for (let mask = 0; mask < 1 << matched.length; mask++) {
    const pairs = matched.flatMap(({ runway, shape }, index) => {
      const [first, second] = mask & (1 << index) ? [shape.ends[1], shape.ends[0]] : shape.ends;
      return [[first, frame.toLocal([coordinateToDecimal(runway.start.latitude), coordinateToDecimal(runway.start.longitude)])], [second, frame.toLocal([coordinateToDecimal(runway.end.latitude), coordinateToDecimal(runway.end.longitude)])]];
    });
    const fit = fitSimilarity(pairs);
    if (Math.abs(fit.rotation) < 90 && (!best || fit.residual < best.residual)) best = fit;
  }
  if (!best) throw new Error('Runways could not be matched on the chart');
  return best;
}

function simplify(points, tolerance) {
  if (points.length < 4) return points;
  const [ax, ay] = points[0], [bx, by] = points[points.length - 1];
  const length = Math.hypot(bx - ax, by - ay) || 1;
  let index = 0, distance = 0;
  for (let k = 1; k < points.length - 1; k++) {
    const d = Math.abs((by - ay) * points[k][0] - (bx - ax) * points[k][1] + bx * ay - by * ax) / length;
    if (d > distance) { distance = d; index = k; }
  }
  return distance > tolerance ? [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)] : [points[0], points[points.length - 1]];
}

// Closed rings start and end on the same point, so split them before simplifying.
const simplifyRing = (ring, tolerance) => { const middle = Math.floor(ring.length / 2); return [...simplify(ring.slice(0, middle + 1), tolerance).slice(0, -1), ...simplify(ring.slice(middle), tolerance)]; };
const round = value => Number(value.toFixed(6));
const near = (point, rings, limit) => rings.some(ring => ring.some(vertex => Math.hypot(vertex[0] - point[0], vertex[1] - point[1]) < limit));

// The ADC TAXIWAYS table ("Width :", "Strength :", ...) as label/lines sections, read from the text
// column under the heading until the next table (OBSTACLES) or the AIRAC footer.
function taxiwayInfo(chart) {
  const heading = chart.text.find(item => item.text === 'TAXIWAYS');
  if (!heading) return [];
  const items = chart.text.filter(item => item.x >= heading.x - 4 && item.y > heading.y + 2 && Math.abs(item.angle) < 0.02).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const item of items) {
    const row = rows.find(value => Math.abs(value.y - item.y) < 2);
    if (row) row.items.push(item); else rows.push({ y: item.y, items: [item] });
  }
  const sections = [];
  let previous = heading.y;
  for (const row of rows) {
    const parts = row.items.sort((a, b) => a.x - b.x).map(item => item.text);
    if (row.y - previous > 30 || /^(OBSTACLES|AIRAC|RUNWAYS|OTHER)\b/.test(parts[0])) break;
    previous = row.y;
    const key = Math.abs(row.items[0].x - heading.x) < 4 && /:$/.test(parts[0]) ? parts.shift().replace(/\s*:$/, '') : null;
    if (key) sections.push({ label: key, lines: [] });
    if (parts.length && sections.length) sections[sections.length - 1].lines.push(parts.join(' '));
  }
  return sections;
}

async function fromChart(icao, config) {
  const layout = runwayData[icao];
  const chart = await readChart(layout.source.url);
  const frame = localFrame(layout.thresholds);
  const fit = georeference(chart, layout.thresholds, frame);
  const areas = [];
  for (const path of chart.paths.filter(value => value.filled)) {
    const kind = config.taxiway.includes(path.fill) ? 'taxiway' : config.apron.includes(path.fill) ? 'apron' : null;
    if (!kind) continue;
    const rings = path.subpaths.filter(ring => ring.length > 2).map(ring => simplifyRing(ring.map(point => fit.map(point)), 1).map(point => frame.toGeo(point).map(round)));
    if (rings.length) areas.push({ kind, rings });
  }
  const pageRings = chart.paths.filter(value => value.filled && [...config.taxiway, ...config.apron].includes(value.fill)).flatMap(value => value.subpaths);
  const labels = [];
  // Taxiway names are set horizontally; rotated letters belong to the graticule labels.
  for (const item of chart.text.filter(value => LABEL.test(value.text) && value.text !== 'NR' && Math.abs(value.angle) < 0.02)) {
    const centre = [item.x + item.width / 2, item.y - item.size / 2];
    if (!near(centre, pageRings, 22)) continue;
    const [lat, lon] = frame.toGeo(fit.map(centre)).map(round);
    labels.push({ text: item.text, lat, lon });
  }
  console.log(`${icao}: chart fit residual ${fit.residual.toFixed(1)} m, ${fit.metresPerPoint.toFixed(3)} m/pt (1:${Math.round(fit.metresPerPoint / 0.0003528)}), rotation ${fit.rotation.toFixed(2)}°, ${areas.length} areas, ${labels.length} labels`);
  if (fit.residual > 25) throw new Error(`${icao}: georeference residual too large (${fit.residual.toFixed(1)} m)`);
  return {
    source: { kind: 'chart', name: layout.source.name, url: layout.source.url, effective: layout.source.effective, retrieved: new Date().toISOString().slice(0, 10), publisher: 'NAVIAIR · AIP Denmark', derivation: `Pavement extracted from the ADC vector artwork and fitted to published runway thresholds (max residual ${Math.round(fit.residual)} m). Not for navigation.` },
    areas, labels, info: taxiwayInfo(chart),
  };
}

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

async function overpass(query) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const endpoint = OVERPASS[attempt % OVERPASS.length];
    try {
      const response = await fetch(endpoint, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { 'User-Agent': 'ekdk-workspace taxiway generator' }, signal: AbortSignal.timeout(90_000) });
      if (response.ok && response.headers.get('content-type')?.includes('json')) return response.json();
    } catch { }
    await new Promise(resolve => setTimeout(resolve, 5_000 * (attempt + 1)));
  }
  throw new Error('Overpass is unavailable; retry later');
}

// OpenStreetMap: taxiway centrelines (drawn at their tagged or a default width) and apron areas.
async function fromOsm(icao) {
  const layout = runwayData[icao];
  const frame = localFrame(layout.thresholds);
  const corners = layout.thresholds.map(value => frame.toLocal([coordinateToDecimal(value.latitude), coordinateToDecimal(value.longitude)]));
  const [south, west] = frame.toGeo([Math.min(...corners.map(c => c[0])) - 1500, Math.min(...corners.map(c => c[1])) - 1500]);
  const [north, east] = frame.toGeo([Math.max(...corners.map(c => c[0])) + 1500, Math.max(...corners.map(c => c[1])) + 1500]);
  const query = `[out:json][timeout:60];way["aeroway"~"^(taxiway|apron)$"](${south},${west},${north},${east});out geom tags;`;
  // OSM_FILE replays a saved Overpass response, e.g. when Overpass is overloaded.
  const result = process.env.OSM_FILE ? JSON.parse(await readFile(process.env.OSM_FILE, 'utf8')) : await overpass(query);
  const geo = way => way.geometry.map(node => [round(node.lat), round(node.lon)]);
  const areas = result.elements.filter(way => way.tags.aeroway === 'apron' && way.geometry?.length > 3).map(way => ({ kind: 'apron', rings: [geo(way)] }));
  const taxiways = result.elements.filter(way => way.tags.aeroway === 'taxiway' && way.geometry?.length > 1);
  const lines = taxiways.map(way => ({ width: Number.parseFloat(way.tags.width) || 18, points: geo(way) }));
  const labels = [];
  const metres = (a, b) => Math.hypot(...frame.toLocal(a).map((value, axis) => value - frame.toLocal(b)[axis]));
  for (const way of taxiways.filter(value => LABEL.test(value.tags.ref || ''))) {
    const points = geo(way);
    const length = points.slice(1).reduce((sum, point, index) => sum + metres(point, points[index]), 0);
    if (length < 120) continue;
    const middle = points[Math.floor(points.length / 2)];
    if (labels.some(label => label.text === way.tags.ref && metres([label.lat, label.lon], middle) < 400)) continue;
    labels.push({ text: way.tags.ref, lat: middle[0], lon: middle[1] });
  }
  console.log(`${icao}: OpenStreetMap ${lines.length} taxiway ways, ${areas.length} aprons, ${labels.length} labels`);
  return {
    source: { kind: 'osm', name: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright', retrieved: new Date().toISOString().slice(0, 10), publisher: '© OpenStreetMap contributors (ODbL)', derivation: 'Taxiway centrelines and aprons from OpenStreetMap, visually checked against the Naviair ADC. Not for navigation.' },
    areas, lines, labels, info: taxiwayInfo(await readChart(layout.source.url)),
  };
}

const forceOsm = process.argv.includes('--osm');
const requested = process.argv.slice(2).filter(value => !value.startsWith('--')).map(value => value.toUpperCase());
const result = { ...existing };
for (const icao of requested.length ? requested : Object.keys(sources)) {
  const config = sources[icao];
  if (!config && !forceOsm) throw new Error(`${icao} has no taxiway source configured`);
  result[icao] = config?.kind === 'chart' && !forceOsm ? await fromChart(icao, config) : await fromOsm(icao);
}
await writeFile(output, JSON.stringify(result) + '\n');
