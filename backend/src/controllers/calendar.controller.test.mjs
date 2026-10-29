import test from 'node:test';
import assert from 'node:assert/strict';
import { icsEscape, icsFold } from './calendar.controller.js';

test('icsEscape escapes commas, semicolons, backslashes and newlines', () => {
  assert.equal(icsEscape('123 Main St, Apt 4; Denver'), '123 Main St\\, Apt 4\\; Denver');
  assert.equal(icsEscape('a\\b'), 'a\\\\b');
  assert.equal(icsEscape('line1\nline2\r\nline3'), 'line1\\nline2\\nline3');
  assert.equal(icsEscape(null), '');
});

test('icsFold keeps lines within 75 octets and never splits a character', () => {
  const long = 'SUMMARY:' + '🙂'.repeat(60);
  const folded = icsFold(long);
  for (const part of folded.split('\r\n')) {
    assert.ok(Buffer.byteLength(part, 'utf8') <= 75, `too long: ${Buffer.byteLength(part, 'utf8')}`);
  }
  assert.equal(folded.replace(/\r\n /g, ''), long);
  assert.equal(icsFold('short line'), 'short line');
});
