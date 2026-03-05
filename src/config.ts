export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export const DEFAULTS = {
  downPaymentPct: 0.25,
  interestRate: 0.067,
  termYears: 30,
  pointsPct: 0,
  closingCosts: 8000,
  vacancyPct: 0.06,
  managementPct: 0.08,
  repairsPct: 0.05,
  capexPct: 0.05,
  reservePct: 0.03,
  expenseRatioPct: 0.42,
  holdYears: 7,
  appreciationPct: 0.03,
  saleCostsPct: 0.06,
  exitCapRate: 0.06,
  targetDscr: 1.25,
  targetCoc: 0.1,
  targetCashFlowMonthly: 250,
};

export const SCENARIOS = {
  base: { label: "Base", rentDelta: 0, vacancyDelta: 0, expenseDelta: 0, rateDelta: 0 },
  upside: { label: "Upside", rentDelta: 0.06, vacancyDelta: -0.015, expenseDelta: -0.04, rateDelta: -0.003 },
  downside: { label: "Downside", rentDelta: -0.08, vacancyDelta: 0.03, expenseDelta: 0.06, rateDelta: 0.005 },
} as const;
