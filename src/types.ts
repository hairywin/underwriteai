export type TabsKey = "overview" | "underwrite" | "comps" | "ai" | "exports" | "settings";

export type StepKey =
  | "deal"
  | "underwrite"
  | "comps"
  | "scenarios"
  | "memo"
  | "exports"
  | "settings";

export type PropertyType = "single_family" | "multifamily";

export type Settings = {
  openaiApiKey: string;
  rentcastApiKey: string;
  fredApiKey: string;
  defaultModel: string;
};

export type UnitMixRow = {
  type: "Studio" | "1BR" | "2BR" | "3BR+";
  count: number;
  avgRent: number;
};

export type PropertyFacts = {
  address: string;
  normalizedAddress?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  estimatedValue?: number;
  sourceNotes?: string[];
};

export type RentComp = {
  id: string;
  address: string;
  city?: string;
  state?: string;
  rent?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  distanceMiles?: number;
  daysOnMarket?: number;
  url?: string;
  score?: number;
  scoreReason?: string;
};

export type SaleComp = {
  id?: string;
  address: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  distanceMiles?: number;
  soldDate?: string;
  url?: string;
  notes?: string;
};

export type UnderwritingInputs = {
  propertyType: PropertyType;
  units: number;
  useUnitMix: boolean;
  unitMix: UnitMixRow[];
  rentMonthly: number;
  otherIncomeMonthly: number;
  purchasePrice: number;
  downPaymentPct: number;
  interestOnly: boolean;
  interestRate: number;
  termYears: number;
  pointsPct: number;
  closingCosts: number;
  propertyTaxAnnual: number;
  insuranceAnnual: number;
  hoaMonthly: number;
  vacancyPct: number;
  managementPct: number;
  repairsPct: number;
  capexPct: number;
  reservePct: number;
  includeCapex: boolean;
  includeManagement: boolean;
  includeReserves: boolean;
  expenseRatioPct: number;
  useExpenseRatio: boolean;
  otherMonthly: number;
  holdYears: number;
  appreciationPct: number;
  saleCostsPct: number;
  exitCapRate: number;
  targetDscr: number;
  targetCoc: number;
  targetCashFlowMonthly: number;
};

export type ScenarioKey = "base" | "upside" | "downside";

export type ScenarioResult = {
  scenario: ScenarioKey;
  grossIncomeMonthly: number;
  effectiveGrossMonthly: number;
  expensesMonthly: number;
  noiMonthly: number;
  debtServiceMonthly: number;
  cashFlowMonthly: number;
  capRate: number;
  cashOnCash: number;
  dscr: number;
  breakEvenOcc: number;
  debtYield: number;
  grm: number;
  annualDebtService: number;
};

export type HoldSeriesPoint = {
  year: number;
  propertyValue: number;
  cumulativeCashFlow: number;
  loanBalance: number;
  equity: number;
};

export type SensitivityCell = {
  rentDelta: number;
  vacancyDelta: number;
  cashFlowMonthly: number;
  dscr: number;
  capRate: number;
};

export type SensitivityGrid = {
  rentDeltas: number[];
  vacancyDeltas: number[];
  cells: SensitivityCell[][];
};

export type DealContext = {
  facts: PropertyFacts | null;
  rentComps: RentComp[];
  saleComps: SaleComp[];
  assumptions: UnderwritingInputs;
  scenarios: ScenarioResult[];
  marketRate?: number;
  inflationRate?: number;
};

export type AiDeepDive = {
  highlights: string[];
  risks: string[];
  rentJustification: string;
  memo: string;
  nextSteps: string[];
};

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};
