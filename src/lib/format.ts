export function money(n: number | undefined, digits = 0) {
  if (n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: digits });
}

export function pct(n: number | undefined, digits = 1) {
  if (n === undefined || Number.isNaN(n)) return "—";
  return (n * 100).toFixed(digits) + "%";
}

export function num(n: number | undefined, digits = 0) {
  if (n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}
