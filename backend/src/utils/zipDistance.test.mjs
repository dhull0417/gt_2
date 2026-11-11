import test from 'node:test';
import assert from 'node:assert/strict';
import { zipKey, coordsForZip, milesBetween, loadZipTable } from './zipDistance.js';

test('zipKey keeps the first five digits and rejects anything else', () => {
  assert.equal(zipKey('84101-1234'), '84101');
  assert.equal(zipKey(' 84101 '), '84101');
  assert.equal(zipKey(' 8410'), null);
  assert.equal(zipKey(''), null);
  assert.equal(zipKey(undefined), null);
  assert.equal(zipKey('ABCDE'), null);
});

test('milesBetween is straight-line miles', () => {
  const slc = [40.7608, -111.891];
  const provo = [40.2338, -111.6585];
  const d = milesBetween(slc, provo);
  assert.ok(d > 36 && d < 40, `got ${d}`);
  assert.equal(milesBetween(slc, slc), 0);
});

test('coordsForZip looks up an injected table', () => {
  loadZipTable({ '11111': [1, 2] });
  assert.deepEqual(coordsForZip('11111-0000'), [1, 2]);
  assert.equal(coordsForZip('22222'), null);
  assert.equal(coordsForZip(''), null);
  loadZipTable(null); // back to the bundled file
});

test('the bundled table has real zips', () => {
  loadZipTable(null);
  const slc = coordsForZip('84101');
  assert.ok(slc && Math.abs(slc[0] - 40.75) < 0.1 && Math.abs(slc[1] + 111.9) < 0.1, `got ${slc}`);
  assert.ok(coordsForZip('00601'));
});
