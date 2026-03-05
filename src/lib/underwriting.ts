import { SCENARIOS } from "../config";
import type { HoldSeriesPoint, ScenarioKey, ScenarioResult, SensitivityGrid, UnderwritingInputs } from "../types";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function monthlyDebtService(loanAmount: number, annualRate: number, termYears: number, interestOnly: boolean) {
  if (loanAmount <= 0) return 0;
  const rm = annualRate / 12;
  if (interestOnly) return loanAmount * rm;
  const n = termYears * 12;
  return rm === 0 ? loanAmount / n : (loanAmount * rm) / (1 - Math.pow(1 + rm, -n));
}

export function effectiveRent(inputs: UnderwritingInputs) {
  if (inputs.propertyType === "multifamily" && inputs.useUnitMix) {
    return inputs.unitMix.reduce((sum, u) => sum + u.count * u.avgRent, 0);
  }
  return inputs.rentMonthly;
}

export function computeScenario(inputs: UnderwritingInputs, scenario: ScenarioKey): ScenarioResult {
  const s = SCENARIOS[scenario];
  const rent = effectiveRent(inputs) * (1 + s.rentDelta);
  const grossIncomeMonthly = rent + inputs.otherIncomeMonthly;
  const vacancy = clamp(inputs.vacancyPct + s.vacancyDelta, 0, 0.5);
  const effectiveGrossMonthly = grossIncomeMonthly * (1 - vacancy);

  const ratioExpenses = inputs.useExpenseRatio ? effectiveGrossMonthly * inputs.expenseRatioPct : 0;
  const variablePct =
    (inputs.includeManagement ? inputs.managementPct : 0) +
    inputs.repairsPct +
    (inputs.includeCapex ? inputs.capexPct : 0) +
    (inputs.includeReserves ? inputs.reservePct : 0);
  const variableExpenses = inputs.useExpenseRatio ? 0 : grossIncomeMonthly * variablePct;
  const fixedExpenses = inputs.propertyTaxAnnual / 12 + inputs.insuranceAnnual / 12 + inputs.hoaMonthly + inputs.otherMonthly;
  const expensesMonthly = (ratioExpenses + variableExpenses + fixedExpenses) * (1 + s.expenseDelta);

  const noiMonthly = effectiveGrossMonthly - expensesMonthly;
  const loanAmount = inputs.purchasePrice * (1 - inputs.downPaymentPct);
  const annualRate = clamp(inputs.interestRate + s.rateDelta, 0, 0.2);
  const debtServiceMonthly = monthlyDebtService(loanAmount, annualRate, inputs.termYears, inputs.interestOnly);
  const cashFlowMonthly = noiMonthly - debtServiceMonthly;

  const cashInvested = inputs.purchasePrice * inputs.downPaymentPct + inputs.purchasePrice * inputs.pointsPct + inputs.closingCosts;
  const annualNoi = noiMonthly * 12;
  const annualDebtService = debtServiceMonthly * 12;

  return {
    scenario,
    grossIncomeMonthly,
    effectiveGrossMonthly,
    expensesMonthly,
    noiMonthly,
    debtServiceMonthly,
    cashFlowMonthly,
    capRate: inputs.purchasePrice ? annualNoi / inputs.purchasePrice : 0,
    cashOnCash: cashInvested ? (cashFlowMonthly * 12) / cashInvested : 0,
    dscr: annualDebtService ? annualNoi / annualDebtService : 99,
    breakEvenOcc: grossIncomeMonthly ? (expensesMonthly + debtServiceMonthly) / grossIncomeMonthly : 0,
    debtYield: loanAmount ? annualNoi / loanAmount : 0,
    grm: grossIncomeMonthly ? inputs.purchasePrice / (grossIncomeMonthly * 12) : 0,
    annualDebtService,
  };
}

export function buildHoldSeries(inputs: UnderwritingInputs): HoldSeriesPoint[] {
  const base = computeScenario(inputs, "base");
  const loanStart = inputs.purchasePrice * (1 - inputs.downPaymentPct);
  const yearlyPrincipal = inputs.interestOnly ? 0 : Math.max(0, base.annualDebtService - loanStart * inputs.interestRate);
  let loanBalance = loanStart;
  let cumulativeCash = 0;
  const rows: HoldSeriesPoint[] = [];
  for (let year = 1; year <= inputs.holdYears; year++) {
    cumulativeCash += base.cashFlowMonthly * 12;
    loanBalance = Math.max(0, loanBalance - yearlyPrincipal);
    const propertyValue = inputs.purchasePrice * Math.pow(1 + inputs.appreciationPct, year);
    rows.push({ year, propertyValue, cumulativeCashFlow: cumulativeCash, loanBalance, equity: propertyValue - loanBalance });
  }
  return rows;
}

export function buildSensitivity(inputs: UnderwritingInputs): SensitivityGrid {
  const rentDeltas = [-0.1, -0.05, 0, 0.05, 0.1];
  const vacancyDeltas = [-0.03, -0.01, 0, 0.02, 0.04];
  const cells = rentDeltas.map((r) =>
    vacancyDeltas.map((v) => {
      const res = computeScenario({ ...inputs, rentMonthly: effectiveRent(inputs) * (1 + r), vacancyPct: clamp(inputs.vacancyPct + v, 0, 0.6) }, "base");
      return { rentDelta: r, vacancyDelta: v, cashFlowMonthly: res.cashFlowMonthly, dscr: res.dscr, capRate: res.capRate };
    })
  );
  return { rentDeltas, vacancyDeltas, cells };
}

export function dealRiskScore(result: ScenarioResult, marketRate?: number) {
  let risk = 0;
  if (result.dscr < 1) risk += 35;
  else if (result.dscr < 1.2) risk += 20;
  if (result.cashFlowMonthly < 0) risk += 25;
  if (result.breakEvenOcc > 0.9) risk += 15;
  if (marketRate && result.capRate < marketRate) risk += 15;
  return clamp(risk, 0, 100);
}

export function maxLoanFromDscr(inputs: UnderwritingInputs) {
  const base = computeScenario(inputs, "base");
  const maxAnnualDebt = (base.noiMonthly * 12) / inputs.targetDscr;
  return maxAnnualDebt / Math.max(inputs.interestRate, 0.001);
}

export function maxOfferFromCoc(inputs: UnderwritingInputs) {
  const res = computeScenario(inputs, "base");
  const targetAnnualCash = (inputs.targetCoc * (inputs.closingCosts + inputs.purchasePrice * inputs.downPaymentPct)) / 12;
  const delta = res.cashFlowMonthly - targetAnnualCash;
  return Math.max(0, inputs.purchasePrice + delta * 120);
}
