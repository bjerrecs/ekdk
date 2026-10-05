export function parseMetar(raw, airport, now = new Date()) {
  const report = raw.trim();
  if (!new RegExp(`^(?:METAR |SPECI )?${airport}\\s`).test(report) || report.length > 4096) throw new Error('No valid METAR is available for this airport.');
  const observation = report.split(/\s+(?:TEMPO|BECMG|NOSIG)\b/)[0];
  const time = observation.match(/\b(\d{2})(\d{2})(\d{2})Z\b/);
  let observedAt = null;
  if (time && Number(time[1]) >= 1 && Number(time[1]) <= 31 && Number(time[2]) < 24 && Number(time[3]) < 60) {
    const candidates = [-1, 0, 1].map(offset => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, Number(time[1]), Number(time[2]), Number(time[3])))).filter(date => date.getUTCDate() === Number(time[1]) && date.getTime() <= now.getTime() + 10 * 60_000);
    candidates.sort((first, second) => Math.abs(now - first) - Math.abs(now - second));
    observedAt = candidates[0]?.toISOString() || null;
  }
  const wind = observation.match(/\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)\b/);
  const pressure = observation.match(/\bQ(\d{4})\b/);
  const inches = observation.match(/\bA(\d{4})\b/);
  const temperature = observation.match(/\b(M?\d{2})\/(M?\d{2}|\/\/)\b/);
  const visibility = observation.match(/\b(\d{4})\b/);
  const clouds = [...observation.matchAll(/\b(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(?:CB|TCU)?/g)].map(match => match[2] === '///' ? `${match[1]} height unavailable` : `${match[1]} ${Number(match[2]) * 100} ft`);
  const degrees = value => value ? `${value.replace('M', '−')} °C` : 'Unavailable';
  return {
    airport, raw: report, observedAt,
    wind: wind ? `${wind[1] === 'VRB' ? 'VRB' : `${wind[1]}°`} ${Number(wind[2])}${wind[3] ? `G${Number(wind[3])}` : ''} ${wind[4] === 'KT' ? 'kt' : 'm/s'}` : 'Unavailable',
    qnh: pressure ? `${pressure[1]} hPa` : inches ? `${(Number(inches[1]) / 100).toFixed(2)} inHg` : 'Unavailable',
    visibility: /\bCAVOK\b/.test(observation) ? '10 km or more' : visibility ? Number(visibility[1]) === 9999 ? '10 km or more' : `${Number(visibility[1])} m` : 'Unavailable',
    cloud: clouds.join(' · ') || (/\bCAVOK\b/.test(observation) ? 'CAVOK' : /\b(NSC|NCD|SKC|CLR)\b/.exec(observation)?.[1] || 'Unavailable'),
    temperature: degrees(temperature?.[1]), dewPoint: degrees(temperature?.[2] === '//' ? null : temperature?.[2]),
  };
}

export function observationAge(observedAt, now = Date.now()) {
  if (!observedAt) return 'Unknown';
  const minutes = Math.max(0, Math.floor((now - new Date(observedAt).getTime()) / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
