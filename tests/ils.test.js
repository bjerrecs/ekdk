import test from 'node:test';
import assert from 'node:assert/strict';
import { extractIlsReference, combineIlsReferences } from '../src/lib/ils-parser.js';

const item = (text, x, y, width = text.length * 4) => ({ text, x, y, width });
const context = { airport: 'EKAH', runway: '10R', height: 842 };
const chart = [item('AD 2 - EKAH', 400, 790), item('ILS RWY 10R', 400, 775), item('Bearings are magnetic', 153, 760), item('0', 257, 217), item('9', 261, 215), item('6', 264, 213), item('º', 268, 212), item('G', 269, 221), item('P', 273, 219), item('096º', 275, 545), item('LOC', 471, 470), item('AAR', 460, 462, 14), item('111.90', 480, 462)];

test('extracts published magnetic course, localizer frequency and identifier', () => {
  const result = extractIlsReference(chart, context);
  assert.deepEqual(result, { course: '096', frequency: '111.90', identifier: 'AAR', issue: null });
});
test('rejects another airport or runway', () => {
  assert.equal(extractIlsReference(chart, { ...context, runway: '28L' }).frequency, null);
  assert.equal(extractIlsReference(chart, { ...context, airport: 'EKCH' }).course, null);
});
test('does not confuse a missed approach track or true bearing with final magnetic course', () => {
  const result = extractIlsReference([...chart, item('101º', 420, 210), item('101º', 450, 520), item('(100.0°)', 257, 226)], context);
  assert.equal(result.course, '096');
});
test('rejects ambiguous localizers, invalid channels and missing course evidence', () => {
  const extra = [item('LOC', 300, 470), item('ABC', 290, 462, 12), item('109.50', 308, 462)];
  assert.equal(extractIlsReference([...chart, ...extra], context).frequency, null);
  assert.equal(extractIlsReference(chart.map(value => value.text === '111.90' ? { ...value, text: '110.40' } : value), context).frequency, null);
  assert.equal(extractIlsReference(chart.filter(value => value.y > 300), context).course, null);
});
test('coding tables are supplementary and never provide a localizer from initial approach tracks', () => {
  const supplement = extractIlsReference([item('AD 2 - EKAH ILS RWY 10R', 400, 780), item('TABULAR DESCRIPTION', 100, 600), item('127 / (131.0)', 300, 500)], context);
  assert.equal(supplement.kind, 'supplement');
  const primary = extractIlsReference(chart, context);
  assert.equal(combineIlsReferences([primary, supplement]).course, '096');
});
test('conflicting variants suppress shared fields; unreadable charts do not silently disappear', () => {
  const primary = extractIlsReference(chart, context);
  const conflict = combineIlsReferences([primary, { ...primary, frequency: '109.50' }]);
  assert.equal(conflict.frequency, null);
  assert.deepEqual(conflict.conflicts, ['frequency']);
  assert.equal(combineIlsReferences([primary, { course: null, frequency: null, identifier: null }]).course, null);
  assert.equal(combineIlsReferences([]).course, null);
});
