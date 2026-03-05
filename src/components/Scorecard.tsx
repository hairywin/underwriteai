import type { ScenarioResult } from "../types";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const money = (n?: number) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);

export function Scorecard({ result, price, rent }: { result: ScenarioResult | null; price: number; rent: number }) {
  const cells = [
    ["Price", money(price)],
    ["Rent", money(rent)],
    ["NOI", money(result?.noiMonthly ? result.noiMonthly * 12 : undefined)],
    ["Cash Flow", money(result?.cashFlowMonthly)],
    ["Cap Rate", result ? pct(result.capRate) : "—"],
    ["CoC", result ? pct(result.cashOnCash) : "—"],
    ["DSCR", result?.dscr?.toFixed(2) ?? "—"],
    ["Break-even Occ", result ? pct(result.breakEvenOcc) : "—"],
    ["Debt Service", money(result?.annualDebtService)],
    ["GRM", result?.grm?.toFixed(2) ?? "—"],
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 bg-slate-900 text-white p-3 rounded-lg sticky top-0 z-10">
      {cells.map(([k, v]) => (
        <div key={k} className="text-xs">
          <div className="text-slate-300">{k}</div>
          <div className="font-semibold">{v}</div>
        </div>
      ))}
    </div>
  );
}
