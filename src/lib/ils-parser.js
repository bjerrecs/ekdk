function angleTokens(items) {
  const angles = [];
  const tokens = items.filter(item => item.text.trim());
  for (let index = 0; index < tokens.length; index++) {
    let text = '';
    const start = tokens[index];
    for (let end = index; end < Math.min(index + 7, tokens.length); end++) {
      const token = tokens[end];
      if (!/^[\d.º°\s]+$/.test(token.text)) break;
      if (end > index && Math.hypot(token.x - tokens[end - 1].x, token.y - tokens[end - 1].y) > 20) break;
      text += token.text.replace(/\s/g, '').replace('º', '°');
      if (/^\d{3}°$/.test(text)) {
        angles.push({ value: Number(text.slice(0, 3)), x: start.x, y: start.y });
        break;
      }
      if (text.includes('°') || text.length > 5) break;
    }
  }
  return angles;
}

export function extractIlsReference(items, { airport, runway, height }) {
  const text = items.map(item => item.text).join(' ');
  const runwayPattern = new RegExp(`\\bILS(?:\\s+or\\s+LOC|\\s*/\\s*LOC)?(?:\\s+[YZ])?\\s+RWY\\s+${runway.replace(/([LRC])$/, '\\s*$1')}\\b`, 'i');
  if (text.includes(airport) && runwayPattern.test(text) && /Instrument Approach Procedure Coding Tables|TABULAR DESCRIPTION/i.test(text) && !/Bearings are magnetic/i.test(text)) {
    return { course: null, frequency: null, identifier: null, issue: null, kind: 'supplement' };
  }
  if (!text.includes(airport) || !runwayPattern.test(text) || !/Bearings are magnetic/i.test(text) || height < 700 || height > 900) {
    return { course: null, frequency: null, identifier: null, issue: 'The chart layout or procedure could not be verified.' };
  }
  const angles = angleTokens(items);
  const heading = Number(runway.slice(0, 2)) * 10;
  const difference = value => Math.abs(((value - heading + 540) % 360) - 180);
  const profile = angles.filter(angle => angle.y > height * 0.18 && angle.y < height * 0.35 && angle.value <= 360 && difference(angle.value) <= 15);
  const glidePaths = items.filter((item, index) => /^GP\b/.test(item.text) || (item.text === 'G' && items[index + 1]?.text === 'P'));
  const glideCourses = profile.filter(angle => glidePaths.some(label => Math.hypot(angle.x - label.x, angle.y - label.y) < 25));
  const candidates = glideCourses.length ? glideCourses : profile.filter(angle => angles.some(other => other.value === angle.value && other.y > height * 0.38));
  const courses = [...new Set(candidates.map(angle => angle.value))];
  const localizers = [];
  for (const frequency of items.filter(item => /^1(?:08|09|10|11)\.\d{2}$/.test(item.text.trim()))) {
    const numeric = Number(frequency.text);
    const channel = Math.round(numeric * 100) % 20;
    if (numeric < 108.1 || numeric > 111.95 || ![10, 15].includes(channel)) continue;
    const label = items.find(item => item.text.trim() === 'LOC' && Math.abs(item.y - frequency.y) <= 20 && Math.abs(item.x - frequency.x) <= 70);
    if (!label) continue;
    const identifiers = items.filter(item => /^[A-Z]{2,4}$/.test(item.text.trim()) && !['LOC', 'DME', 'TWR', 'APP', 'ATIS', 'TACAN'].includes(item.text.trim()) && Math.abs(item.y - frequency.y) <= 1.5 && item.x < frequency.x && frequency.x - (item.x + item.width) < 18);
    if (identifiers.length === 1) localizers.push({ frequency: numeric.toFixed(2), identifier: identifiers[0].text.trim() });
  }
  const uniqueLocalizers = [...new Map(localizers.map(value => [JSON.stringify(value), value])).values()];
  const course = courses.length === 1 ? String(courses[0]).padStart(3, '0') : null;
  const localizer = uniqueLocalizers.length === 1 ? uniqueLocalizers[0] : null;
  return { course, frequency: localizer?.frequency || null, identifier: localizer?.identifier || null, issue: course && localizer ? null : 'Some values could not be extracted unambiguously from this chart.' };
}

export function combineIlsReferences(variants) {
  variants = variants.filter(variant => variant.kind !== 'supplement');
  const values = {};
  const conflicts = [];
  for (const field of ['course', 'frequency', 'identifier']) {
    const candidates = [...new Set(variants.map(variant => variant[field]).filter(value => value !== null))];
    if (candidates.length > 1) conflicts.push(field);
    values[field] = variants.length > 0 && variants.every(variant => variant[field] !== null) && candidates.length === 1 ? candidates[0] : null;
  }
  return { ...values, conflicts };
}
