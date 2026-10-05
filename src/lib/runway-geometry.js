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
  const points = thresholds.map(threshold => ({ ...threshold, latitudeDegrees: coordinateToDecimal(threshold.latitude), longitudeDegrees: coordinateToDecimal(threshold.longitude) }));
  const latitude = points.reduce((sum, point) => sum + point.latitudeDegrees, 0) / points.length;
  const longitude = points.reduce((sum, point) => sum + point.longitudeDegrees, 0) / points.length;
  const projected = points.map(point => ({ ...point, east: (point.longitudeDegrees - longitude) * Math.cos(latitude * Math.PI / 180), north: point.latitudeDegrees - latitude }));
  const eastMin = Math.min(...projected.map(point => point.east));
  const eastMax = Math.max(...projected.map(point => point.east));
  const northMin = Math.min(...projected.map(point => point.north));
  const northMax = Math.max(...projected.map(point => point.north));
  const scale = Math.min(195 / Math.max(eastMax - eastMin, 0.00001), 110 / Math.max(northMax - northMin, 0.00001));
  const normalized = projected.map(point => ({ ...point, x: 127.5 + (point.east - (eastMin + eastMax) / 2) * scale, y: 88 - (point.north - (northMin + northMax) / 2) * scale }));
  const pairs = [];
  const seen = new Set();
  for (const start of normalized) {
    if (seen.has(start.runway)) continue;
    const end = normalized.find(point => point.runway === reciprocalRunway(start.runway));
    if (!end) throw new Error(`Missing reciprocal threshold for ${start.runway}`);
    seen.add(start.runway); seen.add(end.runway);
    pairs.push({ start, end });
  }
  return pairs;
}
