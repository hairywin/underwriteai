import { fetchNeighborhoodProfile } from "./censusData.js";
import { fetchMarketRates } from "./fred.js";
import { normalizeAndGeocodeAddress } from "./geocode.js";
import { fetchPropertyFacts, fetchRentData, fetchValueData } from "./rentcast.js";
import { computeScenario } from "./underwriting.js";
import type { Settings, UnderwritingInputs } from "../types.js";
import { formatCurrency, formatPercent, formatSignedCurrency } from "./format.js";

export type UnderwriteResult = {
  subject: {
    rawAddress: string;
    normalizedAddress?: string;
    lat?: number;
    lng?: number;
    tract?: string;
    countyFips?: string;
    stateFips?: string;
  };
  valuation: { value?: number; source: string; confidence: "high" | "medium" | "low"; warnings: string[] };
  rent: { rentEstimate?: number; source: string; confidence: "high" | "medium" | "low"; warnings: string[] };
  neighborhood: Awaited<ReturnType<typeof fetchNeighborhoodProfile>>;
  macro: { mortgageRate?: number; inflationRef?: number; asOfDates?: { mortgageDate?: string; inflationDate?: string } };
  financials: { noi?: number; capRate?: number; dscr?: number; monthlyCashFlow?: number };
  formattingReady: { value?: string; rent?: string; capRate?: string; dscr?: string; monthlyCashFlow?: string };
  errors: string[];
};

export async function runUnderwritingPipeline(address: string, settings: Settings, inputs: UnderwritingInputs): Promise<UnderwriteResult> {
  const geo = await normalizeAndGeocodeAddress(address);
  if (!geo.isMatchFound) throw new Error(geo.unresolvedMessage || "Address unresolved.");

  const errors: string[] = [];

  const rentcastPromise = (async () => {
    if (!settings.rentcastApiKey.trim()) throw new Error("RentCast key required in Settings.");
    const facts = await fetchPropertyFacts(geo.normalizedAddress || address, settings.rentcastApiKey.trim());
    const [rent, value] = await Promise.all([
      fetchRentData(geo.normalizedAddress || address, settings.rentcastApiKey.trim()),
      fetchValueData(geo.normalizedAddress || address, settings.rentcastApiKey.trim(), {
        listingPrice: inputs.purchasePrice > 0 ? inputs.purchasePrice : undefined,
        subjectSquareFootage: facts?.squareFootage,
      }),
    ]);
    return { facts, rent, value };
  })();

  const censusPromise = fetchNeighborhoodProfile(geo, settings.censusApiKey.trim()).catch((e: any) => {
    errors.push(e.message || "Neighborhood profile unavailable.");
    return { geographyLevel: "unavailable", year: "2022", warnings: ["Neighborhood profile unavailable."] } as Awaited<ReturnType<typeof fetchNeighborhoodProfile>>;
  });

  const fredPromise = settings.fredApiKey.trim()
    ? fetchMarketRates(settings.fredApiKey.trim()).catch((e: any) => {
        errors.push(e.message || "FRED fetch failed.");
        return {};
      })
    : Promise.resolve({});

  const [{ facts, rent, value }, neighborhood, macro] = await Promise.all([rentcastPromise, censusPromise, fredPromise]);

  const nextInputs: UnderwritingInputs = {
    ...inputs,
    purchasePrice: inputs.purchasePrice || value.valueEstimate || facts?.estimatedValue || 0,
    rentMonthly: inputs.rentMonthly || rent.rentEstimate || 0,
  };
  const base = computeScenario(nextInputs, "base");

  return {
    subject: {
      rawAddress: address,
      normalizedAddress: geo.normalizedAddress,
      lat: geo.lat,
      lng: geo.lng,
      tract: geo.tract,
      countyFips: geo.countyFips,
      stateFips: geo.stateFips,
    },
    valuation: {
      value: value.valueEstimate,
      source: value.valuation.source,
      confidence: value.valuation.source === "rentcast_avm" ? "high" : value.valuation.status === "ok" ? "medium" : "low",
      warnings: value.valuation.warnings,
    },
    rent: {
      rentEstimate: rent.rentEstimate,
      source: "rentcast_rent_avm",
      confidence: rent.rentEstimate ? "high" : "low",
      warnings: [],
    },
    neighborhood,
    macro: { mortgageRate: (macro as any).mortgageRate, inflationRef: (macro as any).inflationRef, asOfDates: { mortgageDate: (macro as any).mortgageDate, inflationDate: (macro as any).inflationDate } },
    financials: { noi: base.noiMonthly * 12, capRate: base.capRate, dscr: base.dscr, monthlyCashFlow: base.cashFlowMonthly },
    formattingReady: {
      value: formatCurrency(value.valueEstimate),
      rent: formatCurrency(rent.rentEstimate),
      capRate: formatPercent(base.capRate, 2),
      dscr: base.dscr.toFixed(2),
      monthlyCashFlow: formatSignedCurrency(base.cashFlowMonthly),
    },
    errors,
  };
}
