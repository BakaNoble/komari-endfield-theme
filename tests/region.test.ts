import test from 'node:test';
import assert from 'node:assert/strict';
import { regionCode } from '../src/region.ts';

test('both Komari region formats resolve to the same searchable country code', () => {
  for (const [code, emoji] of [['HK', '🇭🇰'], ['JP', '🇯🇵'], ['US', '🇺🇸'], ['CN', '🇨🇳'], ['DE', '🇩🇪']]) {
    assert.equal(regionCode(code), code);
    assert.equal(regionCode(emoji), code);
    assert.equal(regionCode(` ${code.toLowerCase()} `), code);
  }
  assert.equal(regionCode('uk'), 'GB');
  assert.equal(regionCode('🇬🇧'), 'GB');
});

test('custom regions and malformed flags are not guessed from embedded text', () => {
  for (const value of ['', '香港', 'HKG', 'HK / JP', '🇭', '🇭🇰🇯🇵', 'JP🇯🇵', '../us', '<img>']) {
    assert.equal(regionCode(value), null);
  }
});
