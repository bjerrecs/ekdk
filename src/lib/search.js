import { airports, topics } from './data.js';

export function searchWorkspace(query, context) {
  const normalized = query.toLocaleLowerCase().trim();
  if (!normalized) return [];
  const tokens = normalized.split(/[^\p{L}\d]+/u).filter(Boolean);
  const matched = airports.filter(airport => [airport.id, airport.name, airport.local, ...airport.aliases].filter(Boolean).some(alias => tokens.includes(alias.toLocaleLowerCase())));
  const runwayToken = tokens.find(token => /^(?:rwy)?\d{1,2}[lrc]?$/.test(token));
  const runway = runwayToken?.replace('rwy', '').toUpperCase().replace(/^(\d)([LRC]?)$/, '0$1$2');
  const procedure = tokens.includes('ils') ? 'ILS' : tokens.some(token => ['rnav', 'gnss'].includes(token)) ? 'RNAV' : tokens.includes('vor') ? 'VOR' : null;
  const section = procedure ? 'approaches' : tokens.some(token => ['metar', 'taf', 'weather', 'wind', 'qnh'].includes(token)) ? 'weather' : tokens.some(token => ['chart', 'charts', 'layout', 'taxiway'].includes(token)) ? 'charts' : 'airport';
  const candidates = matched.length ? matched : (runway || procedure || section !== 'airport') && context ? [context] : airports.filter(airport => [airport.id, airport.name, ...airport.aliases].some(alias => alias.toLowerCase().startsWith(normalized)));
  const results = candidates.flatMap(airport => {
    if (runway || procedure) return airport.runways.filter(value => !runway || value === runway || (!/[LRC]/.test(runway) && value.startsWith(runway))).map(value => ({ airport, section: 'approaches', runway: value, procedure: procedure || 'ILS', label: `${airport.id} · ${procedure || 'ILS'} runway ${value}` }));
    return [{ airport, section, label: `${airport.id} · ${airport.name}${section !== 'airport' ? ` · ${section}` : ''}` }];
  });
  const references = topics.filter(topic => topic.toLowerCase().includes(normalized)).map(topic => ({ section: 'procedures', topic, label: topic }));
  return [...results, ...references];
}
