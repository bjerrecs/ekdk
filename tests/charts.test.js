import test from 'node:test';
import assert from 'node:assert/strict';
import runwayData from '../src/lib/runway-data.json' with { type: 'json' };
import { isNaviairPdfUrl, matchApproachCharts, chartGroup } from '../src/lib/chart-policy.js';
import { coordinateToDecimal, projectRunways, reciprocalRunway } from '../src/lib/runway-geometry.js';

test('PDF proxy permits only official Naviair PDF paths', () => {
  assert.equal(isNaviairPdfUrl('https://aim.naviair.dk/media/files/version/EK_AD_2_EKCH_ADC_en.pdf'), true);
  for (const url of ['http://aim.naviair.dk/media/files/test.pdf', 'https://evil.example/media/files/test.pdf', 'https://aim.naviair.dk.evil.example/media/files/test.pdf', 'https://aim.naviair.dk:8443/media/files/test.pdf', 'https://aim.naviair.dk/media/files/test.html', 'https://user:password@aim.naviair.dk/media/files/test.pdf', 'not a URL']) assert.equal(isNaviairPdfUrl(url), false);
});
test('ILS query exposes both chart variants without selecting one automatically', () => {
  const charts = [{ title:'EKCH ILS or LOC RWY 22L - 1 (CAT I+II+III)' }, { title:'EKCH ILS or LOC RWY 22L - 2 (CAT I+II+III)' }, { title:'EKCH ILS or LOC RWY 22R - 1' }, { title:'EKCH RNP RWY 22L - 1' }];
  assert.equal(matchApproachCharts(charts, '22L', 'ILS').length, 2);
  assert.equal(matchApproachCharts(charts, '22L', 'RNAV').length, 1);
});
test('RNAV SID is a departure, not an approach', () => {
  assert.equal(chartGroup({ title:'EKCH RNAV SID RWY 22L' }), 'Departures');
  assert.equal(matchApproachCharts([{ title:'EKCH RNAV SID RWY 22L' }], '22L', 'RNAV').length, 0);
});
test('source coordinates project north upward and preserve runway pairings', () => {
  assert.equal(reciprocalRunway('04L'), '22R');
  assert.equal(reciprocalRunway('08R'), '26L');
  assert.equal(reciprocalRunway('14'), '32');
  assert.equal(coordinateToDecimal('55 30 00N'), 55.5);
  assert.equal(coordinateToDecimal('009 30 00W'), -9.5);
  const copenhagen = projectRunways(runwayData.EKCH.thresholds);
  assert.equal(copenhagen.length, 3);
  assert.ok(copenhagen[0].end.y < copenhagen[0].start.y);
});
test('every diagram has complete reciprocal source coordinates', () => {
  const counts = { EKCH:3, EKBI:1, EKYT:2, EKAH:2, EKRK:2, EKSB:1, EKRN:1, EKSP:2, EKOD:1, EKEB:1 };
  for (const [icao, layout] of Object.entries(runwayData)) {
    assert.equal(projectRunways(layout.thresholds).length, counts[icao]);
    assert.ok(isNaviairPdfUrl(layout.source.url));
    assert.ok(layout.source.name.includes(`${icao}_ADC`));
    assert.ok(isNaviairPdfUrl(layout.physicalSource.url));
    for (const threshold of layout.thresholds) assert.ok(threshold.length > 0 && threshold.width > 0);
  }
});
