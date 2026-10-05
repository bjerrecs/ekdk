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
  EKAH: { kind: 'osm' },
  EKBI: { kind: 'chart', taxiway: ['#a5a5a5'], apron: ['#d2d2d2'] },
  EKOD: { kind: 'osm' },
  EKRK: { kind: 'chart', taxiway: ['#a5a5a5'], apron: ['#d2d2d2'] },
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
function fitSimilarity(pairs, fixedScale = null) {
  const z = pairs.map(([[x, y]]) => [x, -y]), w = pairs.map(([, target]) => target);
  const mean = list => [list.reduce((s, p) => s + p[0], 0) / list.length, list.reduce((s, p) => s + p[1], 0) / list.length];
  const [zx, zy] = mean(z), [wx, wy] = mean(w);
  let re = 0, im = 0, norm = 0;
  z.forEach(([x, y], index) => { const dx = x - zx, dy = y - zy, ex = w[index][0] - wx, ey = w[index][1] - wy; re += ex * dx + ey * dy; im += ey * dx - ex * dy; norm += dx * dx + dy * dy; });
  let a = re / norm, b = im / norm;
  if (fixedScale) { const factor = fixedScale / Math.hypot(a, b); a *= factor; b *= factor; }
  const scale = a * a + b * b;
  const map = ([x, y]) => { const dx = x - zx, dy = -y - zy; return [wx + a * dx - b * dy, wy + b * dx + a * dy]; };
  const invert = ([east, north]) => { const ex = east - wx, ey = north - wy; return [zx + (a * ex + b * ey) / scale, -(zy + (a * ey - b * ex) / scale)]; };
  return { map, invert, metresPerPoint: Math.sqrt(scale), rotation: Math.atan2(b, a) * 180 / Math.PI };
}

// Metres per PDF point from the printed "SCALE 1 : 20 000".
function printedScale(chart) {
  const match = chart.text.map(item => item.text).join(' ').match(/SCALE\s*1\s*:\s*(\d{1,3})\s?(\d{3})(?!\d)/i);
  return match ? Number(match[1] + match[2]) * 0.0254 / 72 : null;
}

const nearestOnLine = ([px, py], [[ax, ay], [bx, by]]) => {
  // Unclamped: drawn runway ends can be cut short by turn pads, so thresholds may lie beyond them.
  const dx = bx - ax, dy = by - ay, t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  return [ax + t * dx, ay + t * dy];
};

// The ADC prints "THR" / "THR 22R" beside displaced thresholds; projected onto the runway axis
// they place a threshold along the runway to within a few points.
function thresholdLabel(chart, ends, designator, atStart) {
  const [[ax, ay], [bx, by]] = ends;
  const length = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / length, uy = (by - ay) / length;
  let best = null;
  for (const item of chart.text) {
    const match = item.text.match(/^THR(?:\s+(\d{2}[LRC]?))?$/);
    if (!match || (match[1] && match[1] !== designator)) continue;
    const cx = item.x + item.width / 2, cy = item.y - item.size * 0.35;
    const along = (cx - ax) * ux + (cy - ay) * uy, across = Math.abs(-(cx - ax) * uy + (cy - ay) * ux);
    const fromEnd = atStart ? along : length - along;
    if (across > 25 || fromEnd < -10 || fromEnd > length / 3) continue;
    if (!best || fromEnd < best.fromEnd) best = { fromEnd, point: [ax + ux * along, ay + uy * along] };
  }
  return best?.point || null;
}

function georeference(chart, thresholds, frame) {
  const threshold = value => frame.toLocal([coordinateToDecimal(value.latitude), coordinateToDecimal(value.longitude)]);
  const runways = [];
  for (const start of thresholds) {
    const end = thresholds.find(value => value.runway === reciprocalRunway(start.runway));
    if (end && start.runway < end.runway) runways.push({ start: threshold(start), end: threshold(end), designators: [start.runway, end.runway], bearing: start.trueBearing, length: Math.hypot(threshold(end)[0] - threshold(start)[0], threshold(end)[1] - threshold(start)[1]) });
  }
  const shapes = runwayCandidates(chart).slice(0, runways.length + 3);
  if (shapes.length < runways.length) throw new Error('Not every runway was found on the chart');
  const scale = printedScale(chart);
  const parallel = runways.every(runway => Math.abs(((runway.bearing - runways[0].bearing) % 180 + 270) % 180 - 90) < 5);
  const assignments = [];
  const permute = (chosen, rest) => { if (chosen.length === runways.length) { assignments.push(chosen); return; } rest.forEach((shape, index) => permute([...chosen, shape], rest.filter((_, other) => other !== index))); };
  permute([], shapes);
  let best = null;
  // Every assignment of candidates to runways and both end orders are tried. A runway whose drawn
  // length matches its threshold distance anchors both ends; a displaced threshold is placed by its
  // THR label, or otherwise only has to lie on the drawn centreline (refined iteratively). The fit
  // must stay within 90° of north-up, which rules out the mirrored solution.
  for (const assignment of assignments) {
    for (let mask = 0; mask < 1 << runways.length; mask++) {
      const setup = runways.map((runway, index) => {
        const ends = mask & (1 << index) ? [assignment[index].ends[1], assignment[index].ends[0]] : assignment[index].ends;
        const anchored = !scale || Math.abs(assignment[index].length * scale / runway.length - 1) < 0.03;
        return { runway, ends, anchored, labels: [] };
      });
      // Parallel runways with only displaced thresholds leave scale and along-runway position open:
      // then the printed chart scale and the THR labels fix them. Otherwise geometry is more precise.
      const underdetermined = parallel && !setup.some(entry => entry.anchored);
      const fixedScale = underdetermined ? scale : null;
      if (underdetermined) for (const entry of setup) entry.labels = [thresholdLabel(chart, entry.ends, entry.runway.designators[0], true), thresholdLabel(chart, entry.ends, entry.runway.designators[1], false)];
      const correspondences = (fit, entry) => [0, 1].map(end => {
        const target = end ? entry.runway.end : entry.runway.start;
        const source = entry.anchored ? entry.ends[end] : entry.labels[end] || (fit ? nearestOnLine(fit.invert(target), entry.ends) : entry.ends[end]);
        return [source, target];
      });
      const anchors = setup.filter(value => value.anchored || (value.labels.length > 0 && value.labels.every(Boolean)));
      let fit = fitSimilarity((anchors.length ? anchors : setup).flatMap(entry => correspondences(null, entry)), fixedScale);
      for (let iteration = 0; iteration < 12; iteration++) fit = fitSimilarity(setup.flatMap(entry => correspondences(fit, entry)), fixedScale);
      const residual = Math.max(...setup.flatMap(entry => correspondences(fit, entry).map(([source, target]) => Math.hypot(fit.map(source)[0] - target[0], fit.map(source)[1] - target[1]))));
      if (Math.abs(fit.rotation) >= 90 || fit.metresPerPoint < 2 || fit.metresPerPoint > 20) continue;
      // Prefer fits that anchor more runways by their ends; only then the smaller residual.
      const better = !best || (residual < 25 && anchors.length > best.anchored) || (anchors.length === best.anchored && residual < best.residual) || (best.residual >= 25 && residual < best.residual);
      if (better) best = { ...fit, residual, anchored: anchors.length, shapes: assignment };
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
  const ordered = rows.map(row => ({ y: row.y, inKeyColumn: Math.abs(Math.min(...row.items.map(item => item.x)) - heading.x) < 4, parts: row.items.sort((a, b) => a.x - b.x).map(item => item.text) }));
  // "TWY H :" rows are values on charts that list them under the key, not keys themselves.
  // Keys are short ("Width / Pavement", "Taxiing guidance system"); longer "...:" lines are values.
  const isKey = row => Boolean(row?.inKeyColumn && /:$/.test(row.parts[0]) && !/^TWY\b/.test(row.parts[0]) && row.parts[0].replace(/[/:]/g, ' ').trim().split(/\s+/).length <= 3);
  for (const [index, row] of ordered.entries()) {
    const parts = [...row.parts];
    if (row.y - previous > 40 || /^(OBSTACLES|AIRAC|RUNWAYS|OTHER)\b/.test(parts[0])) break;
    previous = row.y;
    // Long keys wrap ("Taxiing" / "guidance system :"): a short key-column phrase directly above a key.
    if (row.inKeyColumn && parts.length === 1 && parts[0].split(' ').length <= 2 && !/:$/.test(parts[0]) && isKey(ordered[index + 1])) { pendingKey = `${pendingKey}${parts[0]} `; continue; }
    if (isKey(row)) { sections.push({ label: pendingKey + parts.shift().replace(/\s*:$/, ''), lines: [] }); pendingKey = ''; }
    if (!parts.length || !sections.length) continue;
    const lines = sections[sections.length - 1].lines;
    // A value line ending in ":" ("TWY H :") continues on the next line.
    if (lines.length && /:$/.test(lines[lines.length - 1])) lines[lines.length - 1] += ` ${parts.join(' ')}`;
    else lines.push(parts.join(' '));
  }
  return sections;
}

async function fromChart(icao, config) {
  const layout = runwayData[icao];
  const chart = await readChart(layout.source.url);
  const frame = localFrame(layout.thresholds);
  const fit = georeference(chart, layout.thresholds, frame);
  // Full runway pavement (including pads and any part before a displaced threshold) from the black
  // runway artwork: shapes lying mostly along a matched runway centreline.
  const alongRunway = ([x, y]) => fit.shapes.some(({ ends: [[ax, ay], [bx, by]], width, length }) => {
    const ux = (bx - ax) / length, uy = (by - ay) / length, along = (x - ax) * ux + (y - ay) * uy;
    return Math.abs(-(x - ax) * uy + (y - ay) * ux) <= width / 2 + 4 && along > -80 && along < length + 80;
  });
  const runways = chart.paths.filter(path => path.filled && path.fill === '#000000').flatMap(path => path.subpaths).filter(ring => {
    if (ring.length < 4) return false;
    const span = Math.hypot(Math.max(...ring.map(p => p[0])) - Math.min(...ring.map(p => p[0])), Math.max(...ring.map(p => p[1])) - Math.min(...ring.map(p => p[1])));
    return span > 40 && ring.filter(alongRunway).length / ring.length > 0.6;
  }).map(ring => simplifyRing(ring.map(point => fit.map(point)), 1).map(point => frame.toGeo(point).map(round)));
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
  console.log(`${icao}: chart fit residual ${fit.residual.toFixed(1)} m, ${fit.metresPerPoint.toFixed(3)} m/pt (1:${Math.round(fit.metresPerPoint / 0.0003528)}), rotation ${fit.rotation.toFixed(2)}°, ${fit.anchored} anchored runways, ${areas.length} areas, ${runways.length} runway shapes, ${labels.length} labels`);
  if (fit.residual > 25) throw new Error(`${icao}: georeference residual too large (${fit.residual.toFixed(1)} m)`);
  return {
    source: { kind: 'chart', name: layout.source.name, url: layout.source.url, effective: layout.source.effective, retrieved: new Date().toISOString().slice(0, 10), publisher: 'NAVIAIR · AIP Denmark', derivation: `Pavement extracted from the ADC vector artwork and fitted to published runway thresholds (max residual ${Math.round(fit.residual)} m). Not for navigation.` },
    areas, runways, labels, info: taxiwayInfo(chart),
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

// OpenStreetMap: taxiway centrelines (drawn at their tagged or a default width), aprons and runway
// pavement. Only taxiways named on the official ADC are kept, which leaves out military taxiways
// (shelter areas etc.); aprons must touch a kept taxiway.
async function fromOsm(icao) {
  const layout = runwayData[icao];
  const frame = localFrame(layout.thresholds);
  const chart = await readChart(layout.source.url);
  const chartNames = new Set(chart.text.filter(item => LABEL.test(item.text) && !NOT_TAXIWAYS.has(item.text) && Math.abs(item.angle) < 0.02).map(item => item.text));
  const corners = layout.thresholds.map(value => frame.toLocal([coordinateToDecimal(value.latitude), coordinateToDecimal(value.longitude)]));
  const [south, west] = frame.toGeo([Math.min(...corners.map(c => c[0])) - 1500, Math.min(...corners.map(c => c[1])) - 1500]);
  const [north, east] = frame.toGeo([Math.max(...corners.map(c => c[0])) + 1500, Math.max(...corners.map(c => c[1])) + 1500]);
  const query = `[out:json][timeout:60];way["aeroway"~"^(taxiway|apron|runway)$"](${south},${west},${north},${east});out geom tags;`;
  // OSM_FILE replays a saved Overpass response, e.g. when Overpass is overloaded.
  const result = process.env.OSM_FILE ? JSON.parse(await readFile(process.env.OSM_FILE, 'utf8')) : await overpass(query);
  const geo = way => way.geometry.map(node => [round(node.lat), round(node.lon)]);
  const refs = way => String(way.tags.ref || '').split(/\s*;\s*/).filter(Boolean);
  const taxiways = result.elements.filter(way => way.tags.aeroway === 'taxiway' && way.geometry?.length > 1 && refs(way).some(ref => chartNames.has(ref)));
  const lines = taxiways.map(way => ({ width: Number.parseFloat(way.tags.width) || 18, points: geo(way) }));
  const metres = (a, b) => Math.hypot(...frame.toLocal(a).map((value, axis) => value - frame.toLocal(b)[axis]));
  const taxiwayPoints = lines.flatMap(line => line.points);
  const areas = result.elements.filter(way => way.tags.aeroway === 'apron' && way.geometry?.length > 3 && !way.tags.military && geo(way).some(point => taxiwayPoints.some(other => metres(point, other) < 60))).map(way => ({ kind: 'apron', rings: [geo(way)] }));
  // Runway pavement: the OSM runway centreline (end to end) widened to its tagged or published width.
  const runways = result.elements.filter(way => way.tags.aeroway === 'runway' && way.geometry?.length > 1).map(way => {
    const points = geo(way).map(point => frame.toLocal(point));
    const [ax, ay] = points[0], [bx, by] = points[points.length - 1];
    const length = Math.hypot(bx - ax, by - ay), half = (Number.parseFloat(way.tags.width) || layout.thresholds[0].width || 45) / 2;
    const nx = -(by - ay) / length * half, ny = (bx - ax) / length * half;
    return [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny], [ax + nx, ay + ny]].map(point => frame.toGeo(point).map(round));
  });
  const labels = [];
  for (const way of taxiways) {
    const points = geo(way);
    const length = points.slice(1).reduce((sum, point, index) => sum + metres(point, points[index]), 0);
    const name = refs(way).find(ref => chartNames.has(ref));
    if (length < 120) continue;
    const middle = points[Math.floor(points.length / 2)];
    if (labels.some(label => label.text === name && metres([label.lat, label.lon], middle) < 400)) continue;
    labels.push({ text: name, lat: middle[0], lon: middle[1] });
  }
  console.log(`${icao}: OpenStreetMap ${lines.length} taxiway ways named on the ADC (of ${result.elements.filter(way => way.tags.aeroway === 'taxiway').length}), ${areas.length} aprons, ${runways.length} runways, ${labels.length} labels`);
  return {
    source: { kind: 'osm', name: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright', retrieved: new Date().toISOString().slice(0, 10), publisher: '© OpenStreetMap contributors (ODbL)', derivation: 'Taxiways named on the Naviair ADC, their aprons and runway pavement from OpenStreetMap, visually checked against the ADC. Not for navigation.' },
    areas, lines, runways, labels, info: taxiwayInfo(chart),
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
