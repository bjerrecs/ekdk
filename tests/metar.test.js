import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMetar, observationAge } from '../src/lib/metar.js';

test('decodes VATSIM observation without mixing trend values', () => {
  const report = parseMetar('EKCH 050620Z AUTO 23012G20KT 9999 FEW097/// 13/12 Q1019 TEMPO 30020KT 2000 BKN005', 'EKCH', new Date('2026-10-05T06:35:00Z'));
  assert.equal(report.wind, '230° 12G20 kt');
  assert.equal(report.qnh, '1019 hPa');
  assert.equal(report.visibility, '10 km or more');
  assert.equal(report.cloud, 'FEW 9700 ft');
  assert.equal(report.observedAt, '2026-10-05T06:20:00.000Z');
  assert.equal(observationAge(report.observedAt, Date.parse('2026-10-05T06:35:00Z')), '15 min');
});
test('handles variable winds, CAVOK, negatives and month rollover', () => {
  const report = parseMetar('EKSB 302350Z VRB02KT CAVOK M02/M04 Q1003', 'EKSB', new Date('2026-10-01T00:10:00Z'));
  assert.equal(report.observedAt, '2026-09-30T23:50:00.000Z');
  assert.equal(report.temperature, '−02 °C');
  assert.equal(report.wind, 'VRB 2 kt');
  assert.equal(report.cloud, 'CAVOK');
});
test('rejects wrong station and leaves absent values unavailable', () => {
  assert.throws(() => parseMetar('EKBI 050620Z NIL', 'EKCH'));
  const report = parseMetar('EKCH NIL', 'EKCH');
  assert.equal(report.qnh, 'Unavailable');
  assert.equal(report.observedAt, null);
});
