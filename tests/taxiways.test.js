import test from 'node:test';
import assert from 'node:assert/strict';
import taxiwayData from '../src/lib/taxiway-data.json' with { type: 'json' };
import runwayData from '../src/lib/runway-data.json' with { type: 'json' };
import { projectLayout, projectRunways } from '../src/lib/runway-geometry.js';

test('taxiway layouts are sourced and sit on their airport', () => {
  for (const [icao, layout] of Object.entries(taxiwayData)) {
    assert.ok(runwayData[icao], `${icao} has runway geometry`);
    assert.ok(['chart', 'osm'].includes(layout.source.kind) && layout.source.publisher && layout.source.derivation, `${icao} source`);
    assert.ok(layout.areas.length || layout.lines?.length, `${icao} has geometry`);
    const points = [...layout.areas.flatMap(area => area.rings.flat()), ...(layout.lines || []).flatMap(line => line.points)];
    const { project } = projectLayout(runwayData[icao].thresholds, points, { width: 400, height: 248, fitWidth: 372, fitHeight: 214, centerY: 124 });
    for (const point of [...points, ...layout.labels.map(label => [label.lat, label.lon])]) {
      const [x, y] = project(point);
      assert.ok(x >= 0 && x <= 400 && y >= 0 && y <= 248, `${icao} point in frame`);
    }
  }
});

test('EKYT taxiways come from the ADC with every chart label', () => {
  const ekyt = taxiwayData.EKYT;
  assert.equal(ekyt.source.kind, 'chart');
  assert.deepEqual([...new Set(ekyt.labels.map(label => label.text))].sort(), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'GA1', 'GA2', 'H', 'J', 'K', 'L', 'M', 'N']);
  assert.deepEqual(ekyt.info.find(section => section.label === 'Width').lines[0], 'TWY A, TWY C, TWY D, TWY E, TWY G : 23 M');
});

test('runway projection is unchanged without extra points', () => {
  assert.deepEqual(projectLayout(runwayData.EKBI.thresholds).pairs, projectRunways(runwayData.EKBI.thresholds));
});
