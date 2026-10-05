import runwayData from './runway-data.json' with { type: 'json' };

// Which runway of a direction is used, from AIP Denmark. EKCH: AD 2.21 noise abatement provisions
// (preferential runways 04L/R and 22L/R; RWY 12/30 only above 15 KT crosswind on them; land 04L/22L,
// depart 04R/22R). Other parallels: the ILS-equipped runway in AD 2.19.
export const runwayPolicy = {
  EKCH: { preferential: ['04', '22'], crosswindLimit: 15, arrival: { '04': '04L', '22': '22L' }, departure: { '04': '04R', '22': '22R' } },
  EKYT: { arrival: { '08': '08L', '26': '26R' } },
  EKAH: { arrival: { '10': '10R', '28': '28L' } },
  EKSP: { arrival: { '10': '10L', '28': '28R' } },
};

// Runway to use when the wind is calm or variable. The AIP does not publish one for any supported
// airport, so entries here must come from the applicable VATSIM Scandinavia procedures.
export const calmPreferredRunways = {};

const CALM_KT = 2;
const direction = runway => runway.slice(0, 2);
const runwaysOf = airport => runwayData[airport]?.thresholds || [];
const knownRunway = (airport, runway) => runwaysOf(airport).some(value => value.runway === runway);

function runwayFor(airport, group, kind) {
  const policy = runwayPolicy[airport];
  const named = (kind === 'departure' && policy?.departure?.[group]) || policy?.arrival?.[group];
  if (named) return named;
  return runwaysOf(airport).filter(value => direction(value.runway) === group).sort((first, second) => second.length - first.length)[0]?.runway || null;
}

export function parseWind(metar) {
  const observation = String(metar || '').split(/\s+(?:TEMPO|BECMG|NOSIG)\b/)[0];
  const match = observation.match(/\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)\b/);
  if (!match) return null;
  const factor = match[4] === 'MPS' ? 1.944 : 1;
  return { direction: match[1] === 'VRB' ? null : Number(match[1]), speed: Math.round(Number(match[2]) * factor), gust: match[3] ? Math.round(Number(match[3]) * factor) : null };
}

const RUNWAY = '\\d{2}[LRC]?(?![\\dA-Z])';
const LIST = `(${RUNWAY}(?:\\s*(?:AND|OR|,|/|&)\\s*${RUNWAY})*)`;

export function parseAtis(entries, airport) {
  const result = { arrival: null, departure: null, stations: [] };
  for (const entry of entries || []) {
    const callsign = String(entry.callsign || '').toUpperCase();
    const kind = callsign === `${airport}_A_ATIS` ? 'arrival' : callsign === `${airport}_D_ATIS` ? 'departure' : callsign === `${airport}_ATIS` ? 'combined' : null;
    if (!kind) continue;
    const text = (Array.isArray(entry.text_atis) ? entry.text_atis.join(' ') : String(entry.text_atis || '')).toUpperCase();
    const pick = pattern => (text.match(pattern)?.[1] || '').split(/\s*(?:AND|OR|,|\/|&)\s*/).filter(runway => knownRunway(airport, runway));
    const inUse = pick(new RegExp(`\\b(?:RWYS?|RUNWAYS?) IN USE:?\\s+${LIST}`));
    const landing = pick(new RegExp(`\\b(?:LANDING|LDG|ARRIVAL|ARR)\\s+(?:(?:RWYS?|RUNWAYS?)\\s+)?${LIST}`));
    const takeoff = pick(new RegExp(`\\b(?:DEPARTURE|DEP|TAKE-?OFF|TKOF)\\s+(?:(?:RWYS?|RUNWAYS?)\\s+)?${LIST}`));
    const preferArrival = values => values.find(runway => runway === runwayPolicy[airport]?.arrival?.[direction(runway)]) || values[0];
    const preferDeparture = values => values.find(runway => runway === runwayPolicy[airport]?.departure?.[direction(runway)]) || values[0];
    const arrival = landing[0] || (kind !== 'departure' && inUse.length ? preferArrival(inUse) : null);
    const departure = takeoff[0] || (kind !== 'arrival' && inUse.length ? preferDeparture(inUse) : null);
    if (!arrival && !departure) continue;
    result.arrival ||= arrival;
    result.departure ||= departure;
    result.stations.push({ callsign, code: entry.atis_code || null });
  }
  return result;
}

export function windRunway(airport, wind) {
  if (!wind) return null;
  if (wind.direction === null || wind.speed <= CALM_KT) return { calm: true };
  const groups = [...new Set(runwaysOf(airport).map(value => direction(value.runway)))].map(group => {
    const bearing = runwaysOf(airport).find(value => direction(value.runway) === group).trueBearing;
    const angle = (wind.direction - bearing) * Math.PI / 180;
    return { group, headwind: wind.speed * Math.cos(angle), crosswind: Math.abs(wind.speed * Math.sin(angle)) };
  });
  const policy = runwayPolicy[airport];
  const preferential = policy?.preferential ? groups.filter(value => policy.preferential.includes(value.group)) : [];
  const usable = preferential.length && preferential.some(value => value.crosswind <= policy.crosswindLimit) ? preferential : groups;
  const best = usable.sort((first, second) => second.headwind - first.headwind)[0];
  return best ? { group: best.group, headwind: Math.round(best.headwind), crosswind: Math.round(best.crosswind) } : null;
}

export function selectRunways({ airport, atis, metar }) {
  const fromAtis = parseAtis(atis, airport);
  if (fromAtis.arrival || fromAtis.departure) {
    const arrival = fromAtis.arrival || runwayFor(airport, direction(fromAtis.departure), 'arrival');
    const departure = fromAtis.departure || runwayFor(airport, direction(fromAtis.arrival), 'departure');
    const detail = fromAtis.stations.map(station => `${station.callsign}${station.code ? ` ${station.code}` : ''}`).join(' · ');
    return { arrival, departure, source: { kind: 'atis', label: 'VATSIM ATIS', detail } };
  }
  const wind = parseWind(metar);
  const fromWind = windRunway(airport, wind);
  if (fromWind && !fromWind.calm) {
    const speed = `${String(wind.direction).padStart(3, '0')}° ${wind.speed}${wind.gust ? `G${wind.gust}` : ''} kt`;
    return { arrival: runwayFor(airport, fromWind.group, 'arrival'), departure: runwayFor(airport, fromWind.group, 'departure'), source: { kind: 'wind', label: 'METAR wind', detail: `${speed} · ${fromWind.headwind} kt headwind` } };
  }
  const preferred = calmPreferredRunways[airport];
  if (fromWind?.calm && preferred) {
    return { arrival: runwayFor(airport, direction(preferred), 'arrival'), departure: runwayFor(airport, direction(preferred), 'departure'), source: { kind: 'preferred', label: 'Preferred runway', detail: 'Wind calm or variable' } };
  }
  return { arrival: null, departure: null, source: { kind: 'unavailable', label: 'No runway in use', detail: fromWind?.calm ? 'ATIS offline · wind calm, no preferred runway' : 'ATIS offline · METAR wind unavailable' } };
}
