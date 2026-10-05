import test from 'node:test';
import assert from 'node:assert/strict';
import { isVatsimSession, vatsimToken } from '../src/lib/auth-policy.js';

test('VATSIM CID is stored independently of the Auth.js UUID', () => {
  const token = vatsimToken({ sub: 'f831634b-b33a-4cf9-9479-a1f57f11778e' }, { provider: 'vatsim', providerAccountId: '1234567' });
  assert.equal(token.vatsimCid, '1234567');
  assert.equal(token.sub, 'f831634b-b33a-4cf9-9479-a1f57f11778e');
});
test('subsequent JWT reads retain the VATSIM CID', () => {
  assert.equal(vatsimToken({ sub: 'internal-id', vatsimCid: '1234567' }, null).vatsimCid, '1234567');
});
test('legacy internal-UUID session is invalid on both sides of the gate', () => {
  assert.equal(isVatsimSession({ user: { id: 'f831634b-b33a-4cf9-9479-a1f57f11778e' } }), false);
});
test('only a numeric CID can enter the workspace', () => {
  assert.equal(isVatsimSession({ user: { id: '1234567' } }), true);
  assert.equal(isVatsimSession({ user: { id: '' } }), false);
  assert.equal(isVatsimSession(null), false);
});
test('malformed provider identities are rejected', () => {
  assert.throws(() => vatsimToken({}, { provider: 'vatsim', providerAccountId: 'invalid' }));
});
