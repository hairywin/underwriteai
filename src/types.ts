export type TabsKey = "overview" | "underwrite" | "comps" | "ai" | "exports" | "settings";

export type Settings = {
  openaiApiKey: string;
  rentcastApiKey: string;
  enableWebSearch: boolean;
  searchApiKey: string;
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
  price?: number;
  features?: string[];
  description?: string;
  photoUrl?: string;
  sourceNotes?: string[];
};

export type RentComp = {
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  distanceMiles?: number;
  rent?: number;
  url?: string;
  source?: string;
};

export type SaleComp = {
  address: string;
  price: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  url?: string;
  notes?: string;
};

export type RentcastRentEstimateResponse = {
  rent?: number;
  rentRangeLow?: number;
  rentRangeHigh?: number;
  comparables?: any[];
  subjectProperty?: any;
};

export type UnderwritingInputs = {
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
  otherMonthly: number;

  holdYears: number;
  appreciationPct: number;
  saleCostsPct: number;

  rentMonthly: number;
};

export type ScenarioKey = "base" | "upside" | "downside";

export type ScenarioResult = {
  scenario: ScenarioKey;
  rentMonthly: number;
  effectiveGrossMonthly: number;
  opexMonthly: number;
  noiMonthly: number;
  debtServiceMonthly: number;
  cashFlowMonthly: number;

  capRate: number;
  cashOnCash: number;
  dscr: number;
  breakEvenOcc: number;

  irr: number;
  equityBuild: number;
};

export type AiDeepDive = {
  highlights: string[];
  redFlags: string[];
  rentRationale: string;
  memo: string;
};

export type RentcastMemoContext = {
  rentEstimate?: number;
  rentRangeLow?: number;
  rentRangeHigh?: number;
  valueEstimate?: number;
  valueRangeLow?: number;
  valueRangeHigh?: number;
  subjectProperty?: {
    bedrooms?: number;
    bathrooms?: number;
    squareFootage?: number;
    propertyType?: string;
    yearBuilt?: number;
  };
};
