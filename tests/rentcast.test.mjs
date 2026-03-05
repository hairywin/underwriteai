import test from 'node:test';
import assert from 'node:assert/strict';

const { fetchValueData, rentcastInternals } = await import('../tmp_test_build/lib/rentcast.js');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('address normalization inserts missing comma and trims spaces', () => {
  assert.equal(rentcastInternals.normalizeAddress('101 Jones StBodfish CA 93205'), '101 Jones St, Bodfish, CA 93205');
  assert.equal(rentcastInternals.normalizeAddress(' 101   Jones St ,Bodfish   CA 93205 '), '101 Jones St, Bodfish, CA 93205');
});

test('retry happens only for insufficient comps 400 message', async () => {
  const fetchMock = async (...args) => {
    const call = fetchMock.calls.length;
    fetchMock.calls.push(args);
    if (call === 0) return jsonResponse([{ formattedAddress: '101 Jones St, Bodfish, CA 93205', squareFootage: 1200 }]);
    if (call === 1) return new Response(JSON.stringify({ message: rentcastInternals.INSUFFICIENT_COMPS_MESSAGE }), { status: 400 });
    if (call === 2) return jsonResponse({ price: 250000, comparables: [] });
    throw new Error('unexpected call');
  };
  fetchMock.calls = [];
  globalThis.fetch = fetchMock;

  const out = await fetchValueData('101 Jones StBodfish CA 93205', 'key');
  assert.equal(out.valuation.status, 'ok');
  assert.equal(out.valuation.source, 'rentcast_avm');
  assert.equal(fetchMock.calls.length, 3);
  assert.match(String(fetchMock.calls[1][0]), /maxRadius=1/);
  assert.match(String(fetchMock.calls[2][0]), /maxRadius=5/);
});

test('no retry for non-insufficient-comps 400', async () => {
  const fetchMock = async (...args) => {
    const call = fetchMock.calls.length;
    fetchMock.calls.push(args);
    if (call === 0) return jsonResponse([{ formattedAddress: '101 Jones St, Bodfish, CA 93205' }]);
    if (call === 1) return new Response(JSON.stringify({ message: 'Bad address' }), { status: 400 });
    throw new Error('unexpected call');
  };
  fetchMock.calls = [];
  globalThis.fetch = fetchMock;

  await assert.rejects(() => fetchValueData('101 Jones St, Bodfish, CA 93205', 'key'), /RentCast error 400/);
  assert.equal(fetchMock.calls.length, 2);
});

test('fallback selection prefers listing price then comps ppsf', async () => {
  const insufficient = () => new Response(JSON.stringify({ message: rentcastInternals.INSUFFICIENT_COMPS_MESSAGE }), { status: 400 });

  const mockOne = async (...args) => {
    const call = mockOne.calls.length;
    mockOne.calls.push(args);
    if (call === 0) return jsonResponse([{ formattedAddress: '101 Jones St, Bodfish, CA 93205', squareFootage: 1200 }]);
    if (call >= 1 && call <= 3) return insufficient();
    if (call === 4) return jsonResponse([]);
    throw new Error('unexpected call');
  };
  mockOne.calls = [];
  globalThis.fetch = mockOne;
  const listingFallback = await fetchValueData('101 Jones St, Bodfish, CA 93205', 'key', { listingPrice: 300000, subjectSquareFootage: 1200 });
  assert.equal(listingFallback.valuation.source, 'listing_price_fallback');
  assert.equal(listingFallback.valueEstimate, 300000);

  const mockTwo = async (...args) => {
    const call = mockTwo.calls.length;
    mockTwo.calls.push(args);
    if (call === 0) return jsonResponse([{ formattedAddress: '101 Jones St, Bodfish, CA 93205', squareFootage: 1000 }]);
    if (call >= 1 && call <= 3) return insufficient();
    if (call === 4) return jsonResponse([
      { formattedAddress: '1', lastSalePrice: 200000, squareFootage: 1000 },
      { formattedAddress: '2', lastSalePrice: 360000, squareFootage: 1200 },
    ]);
    throw new Error('unexpected call');
  };
  mockTwo.calls = [];
  globalThis.fetch = mockTwo;
  const ppsfFallback = await fetchValueData('101 Jones St, Bodfish, CA 93205', 'key', { subjectSquareFootage: 1000 });
  assert.equal(ppsfFallback.valuation.source, 'comps_price_per_sqft_fallback');
  assert.ok((ppsfFallback.valueEstimate ?? 0) > 0);
});
