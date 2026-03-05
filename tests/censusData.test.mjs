import test from 'node:test';
import assert from 'node:assert/strict';

const { fetchNeighborhoodProfile } = await import('../tmp_test_build/lib/censusData.js');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('builds tract request with API key and returns tract profile', async () => {
  globalThis.fetch = async (url) => {
    const asText = String(url);
    assert.match(asText, /for=tract%3A000100/);
    assert.match(asText, /in=state%3A06\+county%3A029/);
    assert.match(asText, /key=abc123/);
    return jsonResponse([
      ['B19013_001E','B25064_001E','B25001_001E','B25002_003E','B25003_001E','B25003_002E','B25003_003E','B01003_001E','state','county','tract'],
      ['80000','1200','1000','50','950','500','450','2200','06','029','000100'],
    ]);
  };
  const out = await fetchNeighborhoodProfile({ isMatchFound: true, stateFips: '06', countyFips: '029', tract: '000100' }, 'abc123');
  assert.equal(out.geographyLevel, 'tract');
  assert.equal(out.medianHouseholdIncome, 80000);
  assert.equal(out.vacancyRate, 0.05);
});

test('falls back from tract to county', async () => {
  let call = 0;
  globalThis.fetch = async (url) => {
    call += 1;
    if (call === 1) return jsonResponse({ error: 'bad tract' }, 400);
    assert.match(String(url), /for=county%3A030/);
    return jsonResponse([
      ['B19013_001E','B25064_001E','B25001_001E','B25002_003E','B25003_001E','B25003_002E','B25003_003E','B01003_001E','state','county'],
      ['70000','1100','1000','100','900','400','500','2100','06','030'],
    ]);
  };
  const out = await fetchNeighborhoodProfile({ isMatchFound: true, stateFips: '06', countyFips: '030', tract: '000200' }, 'abc123');
  assert.equal(out.geographyLevel, 'county');
  assert.match(out.warnings.join(' '), /county-level/);
});
