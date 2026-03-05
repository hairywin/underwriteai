import test from 'node:test';
import assert from 'node:assert/strict';

const { normalizeAndGeocodeAddress } = await import('../tmp_test_build/lib/geocode.js');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('geocoder resolves unformatted address without regex normalization dependency', async () => {
  let call = 0;
  globalThis.fetch = async (url) => {
    call += 1;
    if (String(url).includes('/locations/onelineaddress')) {
      assert.match(String(url), /address=101\+Jones\+StBodfish%2C\+CA\+93205/);
      return jsonResponse({
        result: {
          addressMatches: [{ matchedAddress: '101 JONES ST, BODFISH, CA, 93205', coordinates: { x: -118.5, y: 35.5 }, matchType: 'Exact' }],
        },
      });
    }
    return jsonResponse({ result: { geographies: { 'Census Tracts': [{ STATE: '06', COUNTY: '029', TRACT: '000100', BLKGRP: '1' }], Counties: [{ NAME: 'Kern County', STATE: 'CA' }] } } });
  };

  const out = await normalizeAndGeocodeAddress('101 Jones StBodfish, CA 93205');
  assert.equal(out.isMatchFound, true);
  assert.equal(out.normalizedAddress, '101 JONES ST, BODFISH, CA, 93205');
  assert.equal(out.tract, '000100');
  assert.equal(call, 2);
});

test('returns unresolved state when geocoder finds no matches', async () => {
  globalThis.fetch = async () => jsonResponse({ result: { addressMatches: [] } });
  const out = await normalizeAndGeocodeAddress('zzzz unknown');
  assert.equal(out.isMatchFound, false);
  assert.match(out.unresolvedMessage || '', /couldn't resolve/i);
});
