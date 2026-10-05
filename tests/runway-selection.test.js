import test from 'node:test';
import assert from 'node:assert/strict';
import { calmPreferredRunways, parseAtis, parseWind, selectRunways } from '../src/lib/runway-selection.js';

const atis = (callsign, text, code = 'D') => ({ callsign, atis_code: code, text_atis: [text] });
const ekchArrival = atis('EKCH_A_ATIS', 'EKCH ARR ATIS D 0920Z EXPECT ILS APP RWY IN USE 22L RUNWAY 22L CONDITION REPORT AT 0920Z RUNWAY CONDITION CODES 6, 6, 6 TRL 60 WIND 240 14 KT QNH 1019 END OF ATIS D');
const ekchDeparture = atis('EKCH_D_ATIS', 'EKCH DEP ATIS E 0920Z RWY IN USE 22R RUNWAY 22R CONDITION REPORT AT 0920Z TRL 60 WIND 240 14 KT QNH 1019 END OF ATIS E', 'E');

test('ATIS takes priority over the METAR wind', () => {
  const result = selectRunways({ airport: 'EKCH', atis: [ekchArrival, ekchDeparture], metar: 'EKCH 050920Z 04015KT 9999 Q1019' });
  assert.deepEqual([result.arrival, result.departure, result.source.kind], ['22L', '22R', 'atis']);
  assert.equal(result.source.detail, 'EKCH_A_ATIS D · EKCH_D_ATIS E');
});

test('reads combined ATIS and ignores other airports and times', () => {
  const ekyt = atis('EKYT_ATIS', 'EKYT ATIS F 0945Z EXPECT ILS APP RWY IN USE 26R RUNWAY 26R CONDITION REPORT AT 0945Z', 'F');
  assert.deepEqual(parseAtis([ekchArrival, ekyt], 'EKYT'), { arrival: '26R', departure: '26R', stations: [{ callsign: 'EKYT_ATIS', code: 'F' }] });
  const ekbi = atis('EKBI_D_ATIS', 'EKBI DEP ATIS 0920Z DEP 0920Z TRL 40');
  assert.deepEqual(parseAtis([ekbi], 'EKBI'), { arrival: null, departure: null, stations: [] });
});

test('derives the other half of an EKCH configuration from one ATIS', () => {
  const result = selectRunways({ airport: 'EKCH', atis: [ekchDeparture] });
  assert.deepEqual([result.arrival, result.departure], ['22L', '22R']);
});

test('falls back to the runway with most headwind', () => {
  const result = selectRunways({ airport: 'EKBI', atis: [], metar: 'EKBI 050920Z 23013KT 200V260 9999 Q1018' });
  assert.deepEqual([result.arrival, result.source.kind], ['27', 'wind']);
  assert.equal(result.source.detail, '230° 13 kt · 10 kt headwind');
  assert.equal(selectRunways({ airport: 'EKAH', metar: 'EKAH 050920Z 09010KT CAVOK Q1018' }).arrival, '10R');
  assert.equal(selectRunways({ airport: 'EKSP', metar: 'EKSP 050920Z 27008MPS CAVOK Q1018' }).arrival, '28R');
});

test('keeps EKCH on preferential runways until the crosswind exceeds 15 kt', () => {
  assert.deepEqual(Object.values(selectRunways({ airport: 'EKCH', metar: 'EKCH 050920Z 30014KT 9999 Q1019' })).slice(0, 2), ['22L', '22R']);
  assert.equal(selectRunways({ airport: 'EKCH', metar: 'EKCH 050920Z 30025KT 9999 Q1019' }).arrival, '30');
});

test('uses the preferred runway only when the wind is calm', () => {
  assert.equal(parseWind('EKOD 050920Z VRB02KT CAVOK').direction, null);
  assert.equal(selectRunways({ airport: 'EKOD', metar: 'EKOD 050920Z 00000KT CAVOK Q1018' }).source.kind, 'unavailable');
  calmPreferredRunways.EKOD = '24';
  try {
    const calm = selectRunways({ airport: 'EKOD', metar: 'EKOD 050920Z VRB02KT CAVOK Q1018' });
    assert.deepEqual([calm.arrival, calm.source.kind], ['24', 'preferred']);
    assert.equal(selectRunways({ airport: 'EKOD', metar: 'EKOD 050920Z 06008KT CAVOK Q1018' }).arrival, '06');
  } finally { delete calmPreferredRunways.EKOD; }
});

test('reports no runway when nothing is available', () => {
  const result = selectRunways({ airport: 'EKRN', atis: [], metar: '' });
  assert.equal(result.arrival, null);
  assert.equal(result.source.detail, 'ATIS offline · METAR wind unavailable');
});
