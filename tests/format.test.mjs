import test from 'node:test';
import assert from 'node:assert/strict';

const { formatCurrency, formatSignedCurrency, formatPercent, formatNumber } = await import('../tmp_test_build/lib/format.js');

test('formats currency and signed currency', () => {
  assert.equal(formatCurrency(1234), '$1,234');
  assert.equal(formatCurrency(1234.56, 2), '$1,234.56');
  assert.equal(formatSignedCurrency(-123), '-$123');
});

test('formats percent and numbers with rounding', () => {
  assert.equal(formatPercent(0.0625, 2), '6.25%');
  assert.equal(formatNumber(1234.4), '1,234');
  assert.equal(formatNumber(1234.56, 1), '1,234.6');
});
