export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini"; // change if you want
export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export const DEFAULT_PROPERTY_TAX_RATE = 0.012; // 1.2% if unknown
export const DEFAULT_INSURANCE_ANNUAL = 1800;

export const DEFAULTS = {
  downPaymentPct: 0.25,
  interestRate: 0.065,
  termYears: 30,
  pointsPct: 0.0,
  closingCosts: 8000,
  hoaMonthly: 0,
  vacancyPct: 0.06,
  managementPct: 0.08,
  repairsPct: 0.05,
  capexPct: 0.05,
  otherMonthly: 0,
  holdYears: 7,
  appreciationPct: 0.03,
  saleCostsPct: 0.06,
};

export const SCENARIOS = {
  base: { label: "Base", rentAdjPct: 0, vacancyAdjPts: 0, expenseAdjPct: 0 },
  upside: { label: "Upside", rentAdjPct: 0.05, vacancyAdjPts: -0.01, expenseAdjPct: -0.03 },
  downside: { label: "Downside", rentAdjPct: -0.07, vacancyAdjPts: 0.03, expenseAdjPct: 0.05 },
} as const;
