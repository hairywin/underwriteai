function isInvalid(n: number | undefined) {
  return n === undefined || Number.isNaN(n);
}

export function formatCurrency(n: number | undefined, digits = 0) {
  if (isInvalid(n)) return "—";
  return Number(n).toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatSignedCurrency(n: number | undefined, digits = 0) {
  if (isInvalid(n)) return "—";
  const abs = formatCurrency(Math.abs(Number(n)), digits);
  return Number(n) < 0 ? `-${abs}` : abs;
}

export function formatPercent(n: number | undefined, digits = 2) {
  if (isInvalid(n)) return "—";
  return `${(Number(n) * 100).toFixed(digits)}%`;
}

export function formatNumber(n: number | undefined, digits = 0) {
  if (isInvalid(n)) return "—";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export const money = formatCurrency;
export const pct = formatPercent;
export const num = formatNumber;

export function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}
