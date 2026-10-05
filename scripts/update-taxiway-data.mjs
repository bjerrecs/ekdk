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
  EKCH: { kind: 'chart', taxiway: ['#e1e1e1'], apron: [] },
  EKYT: { kind: 'chart', taxiway: ['#969696'], apron: ['#d2d2d2'] },
};

const METRES_PER_DEGREE = 111_320;
const LABEL = /^[A-Z]{1,2}\d{0,2}$/;
// Chart abbreviations that look like taxiway names; ICAO avoids I, O and X for taxiways.
const NOT_TAXIWAYS = new Set(['NR', 'GP', 'NE', 'NW', 'SE', 'SW', 'I', 'O', 'X']);

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

// Runway candidates from the black runway artwork: straight polygon edges are merged into lines,
// and two parallel lines a runway-width apart form a runway. Working on edges rather than whole
// shapes keeps crossing runways (drawn as one polygon) and split runways detectable.
function runwayCandidates(chart) {
  const lines = [];
  for (const path of chart.paths.filter(value => value.filled && value.fill === '#000000')) {
    for (const ring of path.subpaths) {
      for (let index = 1; index < ring.length; index++) {
        const [ax, ay] = ring[index - 1], [bx, by] = ring[index];
        const length = Math.hypot(bx - ax, by - ay);
        if (length < 8) continue;
        let angle = Math.atan2(by - ay, bx - ax);
        // Directions are folded into [-0.01, π - 0.01) so near-horizontal edges are not split at 0/π.
        if (angle < -0.01) angle += Math.PI;
        if (angle >= Math.PI - 0.01) angle -= Math.PI;
        const ux = Math.cos(angle), uy = Math.sin(angle), offset = -ax * uy + ay * ux;
        const along = [ax * ux + ay * uy, bx * ux + by * uy];
        const line = lines.find(value => Math.abs(value.angle - angle) < 0.006 && Math.abs(value.offset - offset) < 0.6);
        if (line) { line.min = Math.min(line.min, ...along); line.max = Math.max(line.max, ...along); }
        else lines.push({ angle, ux, uy, offset, min: Math.min(...along), max: Math.max(...along) });
      }
    }
  }
  const candidates = [];
  for (const [index, first] of lines.entries()) {
    for (const second of lines.slice(index + 1)) {
      const width = Math.abs(first.offset - second.offset);
      if (Math.abs(first.angle - second.angle) > 0.006 || width < 1.5 || width > 14) continue;
      const min = Math.max(first.min, second.min), max = Math.min(first.max, second.max);
      if (max - min < 15 || (max - min) / width < 3) continue;
      const offset = (first.offset + second.offset) / 2, { ux, uy } = first;
      candidates.push({ angle: first.angle, ux, uy, offset, min, max, width });
    }
  }
  // Runway artwork is often interrupted (crossings, gaps), so collinear pieces less than 60 pt
  // apart are joined into one runway before the size filter.
  const runways = [];
  for (const piece of candidates.sort((x, y) => (y.max - y.min) - (x.max - x.min))) {
    const runway = runways.find(value => Math.abs(value.angle - piece.angle) < 0.006 && Math.abs(value.offset - piece.offset) < 2 && piece.min < value.max + 60 && piece.max > value.min - 60);
    if (runway) { runway.min = Math.min(runway.min, piece.min); runway.max = Math.max(runway.max, piece.max); }
    else runways.push({ ...piece });
  }
  return runways.filter(value => value.max - value.min > 60 && (value.max - value.min) / value.width > 12).map(({ ux, uy, offset, min, max, width }) => {
    const point = along => [along * ux - offset * uy, along * uy + offset * ux];
    return { length: max - min, width, ends: [point(min), point(max)] };
  }).sort((x, y) => y.length - x.length);
}

// Least-squares similarity (scale, rotation, translation) from page space (y down) to local metres.
function fitSimilarity(pairs) {
  const z = pairs.map(([[x, y]]) => [x, -y]), w = pairs.map(([, target]) => target);
  const mean = list => [list.reduce((s, p) => s + p[0], 0) / list.length, list.reduce((s, p) => s + p[1], 0) / list.length];
  const [zx, zy] = mean(z), [wx, wy] = mean(w);
  let re = 0, im = 0, norm = 0;
  z.forEach(([x, y], index) => { const dx = x - zx, dy = y - zy, ex = w[index][0] - wx, ey = w[index][1] - wy; re += ex * dx + ey * dy; im += ey * dx - ex * dy; norm += dx * dx + dy * dy; });
  const a = re / norm, b = im / norm, scale = a * a + b * b;
  const map = ([x, y]) => { const dx = x - zx, dy = -y - zy; return [wx + a * dx - b * dy, wy + b * dx + a * dy]; };
  const invert = ([east, north]) => { const ex = east - wx, ey = north - wy; return [zx + (a * ex + b * ey) / scale, -(zy + (a * ey - b * ex) / scale)]; };
  return { map, invert, metresPerPoint: Math.sqrt(scale), rotation: Math.atan2(b, a) * 180 / Math.PI };
}

// Metres per PDF point from the printed "SCALE 1 : 20 000".
function printedScale(chart) {
  const match = chart.text.map(item => item.text).join(' ').match(/SCALE\s*1\s*:\s*(\d{1,3})\s?(\d{3})(?!\d)/i);
  return match ? Number(match[1] + match[2]) * 0.0254 / 72 : null;
}

const nearestOnSegment = ([px, py], [[ax, ay], [bx, by]]) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return [ax + t * dx, ay + t * dy];
};

function georeference(chart, thresholds, frame) {
  const threshold = value => frame.toLocal([coordinateToDecimal(value.latitude), coordinateToDecimal(value.longitude)]);
  const runways = [];
  for (const start of thresholds) {
    const end = thresholds.find(value => value.runway === reciprocalRunway(start.runway));
    if (end && start.runway < end.runway) runways.push({ start: threshold(start), end: threshold(end), length: Math.hypot(threshold(end)[0] - threshold(start)[0], threshold(end)[1] - threshold(start)[1]) });
  }
  const shapes = runwayCandidates(chart).slice(0, runways.length + 3);
  if (shapes.length < runways.length) throw new Error('Not every runway was found on the chart');
  const scale = printedScale(chart);
  const assignments = [];
  const permute = (chosen, rest) => { if (chosen.length === runways.length) { assignments.push(chosen); return; } rest.forEach((shape, index) => permute([...chosen, shape], rest.filter((_, other) => other !== index))); };
  permute([], shapes);
  let best = null;
  // Every assignment of candidates to runways and both end orders are tried. A runway whose drawn
  // length matches its threshold distance anchors both ends; displaced thresholds only have to lie
  // on the drawn centreline (refined iteratively). The fit must stay within 90° of north-up, which
  // rules out the mirrored solution.
  for (const assignment of assignments) {
    for (let mask = 0; mask < 1 << runways.length; mask++) {
      const setup = runways.map((runway, index) => {
        const ends = mask & (1 << index) ? [assignment[index].ends[1], assignment[index].ends[0]] : assignment[index].ends;
        const anchored = !scale || Math.abs(assignment[index].length * scale / runway.length - 1) < 0.03;
        return { runway, ends, anchored };
      });
      const anchors = setup.filter(value => value.anchored);
      let fit = fitSimilarity((anchors.length ? anchors : setup).flatMap(({ runway, ends }) => [[ends[0], runway.start], [ends[1], runway.end]]));
      for (let iteration = 0; iteration < 12; iteration++) {
        fit = fitSimilarity(setup.flatMap(({ runway, ends, anchored }) => anchored ? [[ends[0], runway.start], [ends[1], runway.end]] : [[nearestOnSegment(fit.invert(runway.start), ends), runway.start], [nearestOnSegment(fit.invert(runway.end), ends), runway.end]]));
      }
      const residual = Math.max(...setup.flatMap(({ runway, ends, anchored }) => [[0, runway.start], [1, runway.end]].map(([end, target]) => {
        const source = anchored ? ends[end] : nearestOnSegment(fit.invert(target), ends);
        return Math.hypot(fit.map(source)[0] - target[0], fit.map(source)[1] - target[1]);
      })));
      if (Math.abs(fit.rotation) >= 90 || fit.metresPerPoint < 2 || fit.metresPerPoint > 20) continue;
      // Prefer fits that anchor more runways by their ends; only then the smaller residual.
      const better = !best || (residual < 25 && anchors.length > best.anchored) || (anchors.length === best.anchored && residual < best.residual) || (best.residual >= 25 && residual < best.residual);
      if (better) best = { ...fit, residual, anchored: anchors.length };
    }
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
  let pendingKey = "";
  for (const row of rows) {
    const parts = row.items.sort((a, b) => a.x - b.x).map(item => item.text);
    if (row.y - previous > 30 || /^(OBSTACLES|AIRAC|RUNWAYS|OTHER)\b/.test(parts[0])) break;
    previous = row.y;
    const inKeyColumn = Math.abs(row.items[0].x - heading.x) < 4;
    // Long keys wrap ("Taxiing" / "guidance system :"): a lone key-column word starts the next key.
    if (inKeyColumn && parts.length === 1 && !/:$/.test(parts[0]) && /^[A-Z][a-z]/.test(parts[0])) { pendingKey = `${pendingKey}${parts[0]} `; continue; }
    const key = inKeyColumn && /:$/.test(parts[0]) ? pendingKey + parts.shift().replace(/\s*:$/, '') : null;
    if (key) { sections.push({ label: key, lines: [] }); pendingKey = ''; }
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
  for (const item of chart.text.filter(value => LABEL.test(value.text) && !NOT_TAXIWAYS.has(value.text) && Math.abs(value.angle) < 0.02)) {
    const centre = [item.x + item.width / 2, item.y - item.size / 2];
    if (!near(centre, pageRings, 22)) continue;
    const [lat, lon] = frame.toGeo(fit.map(centre)).map(round);
    labels.push({ text: item.text, lat, lon });
  }
  console.log(`${icao}: chart fit residual ${fit.residual.toFixed(1)} m, ${fit.metresPerPoint.toFixed(3)} m/pt (1:${Math.round(fit.metresPerPoint / 0.0003528)}), rotation ${fit.rotation.toFixed(2)}°, ${fit.anchored} anchored runways, ${areas.length} areas, ${labels.length} labels`);
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
