export function coordinateToDecimal(value) {
  const match = value.match(/^(\d+)\s+(\d+)\s+([\d.]+)([NSEW])$/);
  if (!match) throw new Error('Invalid source coordinate');
  const decimal = Number(match[1]) + Number(match[2]) / 60 + Number(match[3]) / 3600;
  return ['S', 'W'].includes(match[4]) ? -decimal : decimal;
}

export function reciprocalRunway(runway) {
  const match = runway.match(/^(\d{2})([LRC]?)$/);
  if (!match) throw new Error('Invalid runway designator');
  const opposite = ((Number(match[1]) + 17) % 36) + 1;
  return String(opposite).padStart(2, '0') + ({ L: 'R', R: 'L', C: 'C', '': '' }[match[2]]);
}

export function projectRunways(thresholds) {
  return projectLayout(thresholds).pairs;
}

// Projects runways plus optional extra [latitude, longitude] points (taxiway pavement) into the
// diagram frame (default 255 × 174); the frame is fitted to everything so extras stay in view.
export function projectLayout(thresholds, extra = [], frame = { width: 255, fitWidth: 195, fitHeight: 110, centerY: 88 }) {
  const points = thresholds.map(threshold => ({ ...threshold, latitudeDegrees: coordinateToDecimal(threshold.latitude), longitudeDegrees: coordinateToDecimal(threshold.longitude) }));
  const latitude = points.reduce((sum, point) => sum + point.latitudeDegrees, 0) / points.length;
  const longitude = points.reduce((sum, point) => sum + point.longitudeDegrees, 0) / points.length;
  const toLocal = ([lat, lon]) => ({ east: (lon - longitude) * Math.cos(latitude * Math.PI / 180), north: lat - latitude });
  const projected = points.map(point => ({ ...point, ...toLocal([point.latitudeDegrees, point.longitudeDegrees]) }));
  const bounds = [...projected, ...extra.map(toLocal)];
  const eastMin = Math.min(...bounds.map(point => point.east));
  const eastMax = Math.max(...bounds.map(point => point.east));
  const northMin = Math.min(...bounds.map(point => point.north));
  const northMax = Math.max(...bounds.map(point => point.north));
  const scale = Math.min(frame.fitWidth / Math.max(eastMax - eastMin, 0.00001), frame.fitHeight / Math.max(northMax - northMin, 0.00001));
  const toFrame = ({ east, north }) => [frame.width / 2 + (east - (eastMin + eastMax) / 2) * scale, frame.centerY - (north - (northMin + northMax) / 2) * scale];
  const normalized = projected.map(point => { const [x, y] = toFrame(point); return { ...point, x, y }; });
  const pairs = [];
  const seen = new Set();
  for (const start of normalized) {
    if (seen.has(start.runway)) continue;
    const end = normalized.find(point => point.runway === reciprocalRunway(start.runway));
    if (!end) throw new Error(`Missing reciprocal threshold for ${start.runway}`);
    seen.add(start.runway); seen.add(end.runway);
    pairs.push({ start, end });
  }
  return { pairs, project: point => toFrame(toLocal(point)), metresPerUnit: 111_320 / scale };
}
