import type { MonteCarloSummary, ScenarioKey, ScenarioResult, UnderwritingInputs } from "../types";
import { clamp } from "./format";
import { SCENARIOS } from "../config";

function pmt(rateMonthly: number, n: number, pv: number) {
  if (rateMonthly === 0) return pv / n;
  const r = rateMonthly;
  return (r * pv) / (1 - Math.pow(1 + r, -n));
}

function amortBalance(pv: number, rateMonthly: number, payment: number, months: number) {
  let bal = pv;
  for (let i = 0; i < months; i++) {
    const interest = bal * rateMonthly;
    const principal = payment - interest;
    bal = Math.max(0, bal - principal);
  }
  return bal;
}

function irr(cashflows: number[]): number {
  // simple Newton-Raphson IRR (monthly cashflows), returns annualized
  let x = 0.01; // monthly guess
  for (let iter = 0; iter < 50; iter++) {
    let f = 0;
    let df = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const denom = Math.pow(1 + x, t);
      f += cashflows[t] / denom;
      df += (-t * cashflows[t]) / (denom * (1 + x));
    }
    const step = f / df;
    x = x - step;
    if (Math.abs(step) < 1e-7) break;
  }
  const annual = Math.pow(1 + x, 12) - 1;
  return annual;
}

export function computeScenario(inputs: UnderwritingInputs, scenario: ScenarioKey): ScenarioResult {
  const s = SCENARIOS[scenario];
  const rentMonthly = inputs.rentMonthly * (1 + s.rentAdjPct);
  const vacancyPct = clamp(inputs.vacancyPct + s.vacancyAdjPts, 0, 0.4);

  const vacancyLoss = rentMonthly * vacancyPct;
  const effectiveGrossMonthly = rentMonthly - vacancyLoss;

  const variableOpex =
    rentMonthly *
    (inputs.managementPct + inputs.repairsPct + inputs.capexPct) *
    (1 + s.expenseAdjPct);

  const fixedOpex =
    inputs.hoaMonthly +
    inputs.otherMonthly +
    inputs.propertyTaxAnnual / 12 +
    inputs.insuranceAnnual / 12;

  const opexMonthly = variableOpex + fixedOpex;
  const noiMonthly = effectiveGrossMonthly - opexMonthly;

  const downPayment = inputs.purchasePrice * inputs.downPaymentPct;
  const loanAmount = Math.max(0, inputs.purchasePrice - downPayment);
  const rateMonthly = inputs.interestRate / 12;
  const n = Math.round(inputs.termYears * 12);

  let debtServiceMonthly = 0;
  if (loanAmount > 0) {
    if (inputs.interestOnly) debtServiceMonthly = loanAmount * rateMonthly;
    else debtServiceMonthly = pmt(rateMonthly, n, loanAmount);
  }

  const cashFlowMonthly = noiMonthly - debtServiceMonthly;

  const capRate = (noiMonthly * 12) / inputs.purchasePrice;
  const cashInvested = downPayment + inputs.closingCosts + inputs.purchasePrice * inputs.pointsPct;
  const cashOnCash = cashInvested > 0 ? (cashFlowMonthly * 12) / cashInvested : 0;

  const dscr = debtServiceMonthly > 0 ? noiMonthly / debtServiceMonthly : Infinity;
  const breakEvenOcc = rentMonthly > 0 ? clamp((opexMonthly + debtServiceMonthly) / rentMonthly, 0, 2) : 0;

  // IRR / equity build (simple hold model)
  const monthsHold = Math.max(1, Math.round(inputs.holdYears * 12));
  const salePrice = inputs.purchasePrice * Math.pow(1 + inputs.appreciationPct, inputs.holdYears);
  const saleCosts = salePrice * inputs.saleCostsPct;
  const netSaleProceedsBeforeDebt = salePrice - saleCosts;

  const payment = (!inputs.interestOnly && loanAmount > 0) ? pmt(rateMonthly, n, loanAmount) : 0;
  const balanceAtSale =
    loanAmount <= 0 ? 0 :
    inputs.interestOnly ? loanAmount :
    amortBalance(loanAmount, rateMonthly, payment, monthsHold);

  const netSaleProceeds = netSaleProceedsBeforeDebt - balanceAtSale;
  const equityBuild = Math.max(0, loanAmount - balanceAtSale);

  const cashflows: number[] = [];
  cashflows.push(-cashInvested);
  for (let i = 0; i < monthsHold; i++) cashflows.push(cashFlowMonthly);
  cashflows[cashflows.length - 1] += netSaleProceeds;

  const irrAnnual = irr(cashflows);

  return {
    scenario,
    rentMonthly,
    effectiveGrossMonthly,
    opexMonthly,
    noiMonthly,
    debtServiceMonthly,
    cashFlowMonthly,
    capRate,
    cashOnCash,
    dscr,
    breakEvenOcc,
    irr: irrAnnual,
    equityBuild,
  };
}

export function underwritingSummaryText(base: ScenarioResult, up: ScenarioResult, down: ScenarioResult) {
  const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "inf");
  return [
    `Base: cashflow/mo=${base.cashFlowMonthly.toFixed(0)}, capRate=${fmt(base.capRate*100)}%, CoC=${fmt(base.cashOnCash*100)}%, DSCR=${fmt(base.dscr)}`,
    `Upside: cashflow/mo=${up.cashFlowMonthly.toFixed(0)}, capRate=${fmt(up.capRate*100)}%, CoC=${fmt(up.cashOnCash*100)}%, DSCR=${fmt(up.dscr)}`,
    `Downside: cashflow/mo=${down.cashFlowMonthly.toFixed(0)}, capRate=${fmt(down.capRate*100)}%, CoC=${fmt(down.cashOnCash*100)}%, DSCR=${fmt(down.dscr)}`
  ].join("\n");
}

export function sensitivityGrid(inputs: UnderwritingInputs) {
  const rentDeltas = [-0.1, -0.05, 0, 0.05, 0.1];
  const vacancyDeltas = [-0.03, -0.01, 0, 0.02, 0.04];

  const grid = rentDeltas.map((rd) =>
    vacancyDeltas.map((vd) => {
      const adj: UnderwritingInputs = { ...inputs, rentMonthly: inputs.rentMonthly * (1 + rd), vacancyPct: clamp(inputs.vacancyPct + vd, 0, 0.5) };
      const r = computeScenario(adj, "base");
      return { cashFlowMonthly: r.cashFlowMonthly, dscr: r.dscr };
    })
  );

  return { rentDeltas, vacancyDeltas, grid };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

export function monteCarloSummary(inputs: UnderwritingInputs, iterations = 250): MonteCarloSummary {
  const irrValues: number[] = [];
  let dscrBelowOne = 0;
  let negativeCash = 0;

  for (let i = 0; i < iterations; i++) {
    const rentShock = (Math.random() - 0.5) * 0.2;
    const vacancyShock = (Math.random() - 0.5) * 0.06;
    const expenseShock = (Math.random() - 0.5) * 0.1;
    const appreciationShock = (Math.random() - 0.5) * 0.04;

    const simInputs: UnderwritingInputs = {
      ...inputs,
      rentMonthly: Math.max(0, inputs.rentMonthly * (1 + rentShock)),
      vacancyPct: clamp(inputs.vacancyPct + vacancyShock, 0, 0.5),
      managementPct: clamp(inputs.managementPct * (1 + expenseShock), 0, 0.3),
      repairsPct: clamp(inputs.repairsPct * (1 + expenseShock), 0, 0.3),
      capexPct: clamp(inputs.capexPct * (1 + expenseShock), 0, 0.3),
      appreciationPct: clamp(inputs.appreciationPct + appreciationShock, -0.1, 0.2),
    };

    const r = computeScenario(simInputs, "base");
    irrValues.push(r.irr);
    if (r.dscr < 1) dscrBelowOne += 1;
    if (r.cashFlowMonthly < 0) negativeCash += 1;
  }

  irrValues.sort((a, b) => a - b);
  return {
    iterations,
    p10Irr: percentile(irrValues, 0.1),
    p50Irr: percentile(irrValues, 0.5),
    p90Irr: percentile(irrValues, 0.9),
    pNegativeCashFlow: negativeCash / iterations,
    pDscrBelowOne: dscrBelowOne / iterations,
  };
}
